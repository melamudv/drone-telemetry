import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DroneRecord, PipelineRun, RejectedRecord
from app.pipeline.validation import validate_record

logger = logging.getLogger(__name__)

STARTED, COMPLETED, FAILED = "started", "completed", "failed"


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def load_records(path: Path) -> list:
    """Step 1: load raw records from a JSON file (must contain an array)."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError("input file must contain a JSON array of records")
    return data


def start_run(db: Session) -> PipelineRun:
    run = PipelineRun(started_at=utcnow(), status=STARTED)
    db.add(run)
    db.commit()
    return run


STALE_RUN_AFTER = timedelta(minutes=5)


def has_active_run(db: Session) -> bool:
    """A 'started' run counts as active unless it is stale (e.g. the server died mid-run)."""
    cutoff = utcnow() - STALE_RUN_AFTER
    return (
        db.scalar(
            select(PipelineRun.id)
            .where(PipelineRun.status == STARTED, PipelineRun.started_at > cutoff)
            .limit(1)
        )
        is not None
    )


def _raw_json(raw: Any) -> str:
    try:
        return json.dumps(raw, ensure_ascii=False, default=str)
    except TypeError:
        return json.dumps(str(raw))


def _remember_reject(db: Session, outcome: str, raw: Any, reason: str | None, drone_id: str | None = None) -> None:
    db.add(RejectedRecord(outcome=outcome, drone_id=drone_id, reason=reason, raw_json=_raw_json(raw)))


def process(db: Session, raw_records: list, run: PipelineRun) -> None:
    """Steps 2-5: validate, skip invalid, normalize, store; fill counters on the run."""
    run.total_records = len(raw_records)
    valid = invalid = duplicates = 0

    candidates = []
    for index, raw in enumerate(raw_records):
        record, error = validate_record(raw)
        if record is None:
            invalid += 1
            drone_id = raw.get("drone_id") if isinstance(raw, dict) else None
            _remember_reject(db, "invalid", raw, error, drone_id if isinstance(drone_id, str) else None)
            logger.warning("Skipping invalid record #%d: %s", index, error)
        else:
            candidates.append((raw, record))

    existing = set()
    if candidates:
        ids = {record.drone_id for _, record in candidates}
        existing = set(
            db.execute(
                select(DroneRecord.drone_id, DroneRecord.timestamp).where(DroneRecord.drone_id.in_(ids))
            ).all()
        )

    for raw, record in candidates:
        key = (record.drone_id, record.timestamp)
        if key in existing:
            duplicates += 1
            _remember_reject(db, "duplicate", raw, "drone_id + timestamp already stored", record.drone_id)
            continue
        existing.add(key)
        db.add(DroneRecord(**record.model_dump()))
        valid += 1

    run.valid_records = valid
    run.invalid_records = invalid
    run.duplicate_records = duplicates


def recount(db: Session, run: PipelineRun) -> None:
    """Classify what is already stored. Does not insert or delete rows."""
    valid = invalid = duplicates = 0
    seen: set[tuple] = set()

    def classify(raw: Any) -> None:
        nonlocal valid, invalid, duplicates
        record, _error = validate_record(raw)
        if record is None:
            invalid += 1
            return
        key = (record.drone_id, record.timestamp)
        if key in seen:
            duplicates += 1
            return
        seen.add(key)
        valid += 1

    for row in db.scalars(select(DroneRecord).order_by(DroneRecord.id)):
        classify(records_from_db_row(row))
    for rejected in db.scalars(select(RejectedRecord).order_by(RejectedRecord.id)):
        classify(json.loads(rejected.raw_json))

    run.total_records = valid + invalid + duplicates
    run.valid_records = valid
    run.invalid_records = invalid
    run.duplicate_records = duplicates


def records_from_db_row(row: DroneRecord) -> dict:
    return {
        "drone_id": row.drone_id,
        "drone_type": row.drone_type,
        "operator_id": row.operator_id,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "altitude_m": row.altitude_m,
        "speed_kmh": row.speed_kmh,
        "battery_percent": row.battery_percent,
        "timestamp": row.timestamp.isoformat() + "Z",
        "status": row.status,
    }


def records_from_db(db: Session) -> list:
    """Stored telemetry as raw records, so a run can re-check what is already in the DB."""
    return [records_from_db_row(row) for row in db.scalars(select(DroneRecord).order_by(DroneRecord.id))]


def db_has_checked_data(db: Session) -> bool:
    return (
        db.scalar(select(DroneRecord.id).limit(1)) is not None
        or db.scalar(select(RejectedRecord.id).limit(1)) is not None
    )


def execute_run(
    run_id: int,
    session_factory: Callable[[], Session],
    input_file: Path,
    extra_source: Callable[[Session], list] | None = None,
) -> None:
    """Run the full pipeline for an existing 'started' run; always records a final status.

    `extra_source` supplies the records to check. The input file is used only when that
    source has nothing to offer (the initial load, while the DB is empty).
    """
    db = session_factory()
    try:
        run = db.get(PipelineRun, run_id)
        try:
            if db_has_checked_data(db):
                # Re-check stored rows only. New points come from Add data, not from this run.
                recount(db, run)
            else:
                fresh = extra_source(db) if extra_source else []
                process(db, fresh or load_records(input_file), run)
            run.status = COMPLETED
        except Exception as exc:  # any failure marks the whole run as failed
            db.rollback()
            logger.exception("Pipeline run %s failed", run_id)
            run = db.get(PipelineRun, run_id)
            run.status = FAILED
            run.error_message = f"{type(exc).__name__}: {exc}"
            run.total_records = run.valid_records = run.invalid_records = run.duplicate_records = 0
        run.finished_at = utcnow()
        db.commit()
    finally:
        db.close()
