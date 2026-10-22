from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app import database
from app.database import get_db
from app.models import DroneRecord, PipelineRun
from app.pipeline import runner
from app.schemas import PipelineRunOut, StatsOut

router = APIRouter(prefix="/api", tags=["pipeline"])

LOW_BATTERY_THRESHOLD = 20


def get_session_factory():
    return database.SessionLocal


def get_input_file():
    return config.INPUT_FILE


def get_extra_source():
    """Re-check rows already stored. An empty DB falls back to the input file."""
    return runner.records_from_db


@router.post("/pipeline/run", response_model=PipelineRunOut, status_code=202)
def run_pipeline(
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    session_factory=Depends(get_session_factory),
    input_file=Depends(get_input_file),
    extra_source=Depends(get_extra_source),
):
    """Start the pipeline in the background; poll GET /api/pipeline/runs for the result."""
    if runner.has_active_run(db):
        raise HTTPException(status_code=409, detail="A pipeline run is already in progress")
    run = runner.start_run(db)
    background.add_task(runner.execute_run, run.id, session_factory, input_file, extra_source)
    return run


@router.get("/pipeline/runs", response_model=list[PipelineRunOut])
def list_runs(limit: int = 20, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 100))
    return db.scalars(select(PipelineRun).order_by(PipelineRun.id.desc()).limit(limit)).all()


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    latest_ts = (
        select(DroneRecord.drone_id, func.max(DroneRecord.timestamp).label("ts"))
        .group_by(DroneRecord.drone_id)
        .subquery()
    )
    latest = db.execute(
        select(DroneRecord.status, DroneRecord.battery_percent).join(
            latest_ts,
            (DroneRecord.drone_id == latest_ts.c.drone_id) & (DroneRecord.timestamp == latest_ts.c.ts),
        )
    ).all()
    by_status: dict[str, int] = {}
    for status, _ in latest:
        by_status[status] = by_status.get(status, 0) + 1
    return StatsOut(
        total_records=db.scalar(select(func.count(DroneRecord.id))) or 0,
        total_drones=len(latest),
        by_status=by_status,
        low_battery_drones=sum(1 for _, b in latest if b < LOW_BATTERY_THRESHOLD),
        last_run=db.scalars(select(PipelineRun).order_by(PipelineRun.id.desc()).limit(1)).first(),
    )
