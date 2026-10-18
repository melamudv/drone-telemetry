from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DroneRecord
from app.schemas import DroneOut, DronePage

router = APIRouter(prefix="/api", tags=["drones"])

MAX_PAGE_SIZE = 1000


def parse_bound(value: str | None, name: str, end: bool = False) -> datetime | None:
    """Parse an ISO date/datetime query value to naive UTC. A date-only 'to' covers the whole day."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail=f"'{name}' must be an ISO date or datetime")
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    if end and len(value) == 10:
        dt += timedelta(days=1) - timedelta(microseconds=1)
    return dt


def filtered_query(
    drone_type, status, operator_id, min_battery, date_from, date_to, drone_id=None
):
    q = select(DroneRecord)
    if drone_id:
        q = q.where(DroneRecord.drone_id == drone_id)
    if drone_type:
        q = q.where(DroneRecord.drone_type.in_(drone_type))
    if status:
        q = q.where(DroneRecord.status.in_(status))
    if operator_id:
        q = q.where(DroneRecord.operator_id == operator_id)
    if min_battery is not None:
        q = q.where(DroneRecord.battery_percent >= min_battery)
    if date_from:
        q = q.where(DroneRecord.timestamp >= date_from)
    if date_to:
        q = q.where(DroneRecord.timestamp <= date_to)
    return q


@router.get("/drones", response_model=DronePage)
def list_drones(
    drone_type: list[str] | None = Query(None, description="Repeat to match several types"),
    status: list[str] | None = Query(None, description="Repeat to match several statuses"),
    operator_id: str | None = None,
    min_battery: float | None = Query(None, ge=0, le=100),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    latest_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
):
    base = filtered_query(
        drone_type,
        status,
        operator_id,
        min_battery,
        parse_bound(date_from, "from"),
        parse_bound(date_to, "to", end=True),
    )

    if latest_only:
        # Latest matching row per drone, via a window function.
        ranked = base.add_columns(
            func.row_number()
            .over(partition_by=DroneRecord.drone_id, order_by=DroneRecord.timestamp.desc())
            .label("rn")
        ).subquery()
        ids = select(ranked.c.id).where(ranked.c.rn == 1)
    else:
        ids = base.with_only_columns(DroneRecord.id)

    total = db.scalar(select(func.count()).select_from(ids.subquery()))
    items = db.scalars(
        select(DroneRecord)
        .where(DroneRecord.id.in_(ids))
        .order_by(DroneRecord.timestamp.desc(), DroneRecord.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return DronePage(items=items, total=total, page=page, page_size=page_size)


@router.get("/drone-types", response_model=list[str])
def list_drone_types(db: Session = Depends(get_db)):
    return list(db.scalars(select(DroneRecord.drone_type).distinct().order_by(DroneRecord.drone_type)))


@router.get("/drones/{record_id}", response_model=DroneOut)
def get_drone(record_id: int, db: Session = Depends(get_db)):
    record = db.get(DroneRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Drone record not found")
    return record


@router.get("/drones/{drone_id}/path", response_model=list[DroneOut])
def get_drone_path(drone_id: str, db: Session = Depends(get_db)):
    """All positions of one drone, oldest first, for drawing its path."""
    rows = db.scalars(
        select(DroneRecord).where(DroneRecord.drone_id == drone_id).order_by(DroneRecord.timestamp)
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="Drone not found")
    return rows
