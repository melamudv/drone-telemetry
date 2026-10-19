import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DroneRecord, PipelineRun
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


def process(db: Session, raw_records: list, run: PipelineRun) -> None:
    """Steps 2-5: validate, skip invalid, normalize, store; fill counters on the run."""
    run.total_records = len(raw_records)
    valid = invalid = duplicates = 0

    candidates = []
    for index, raw in enumerate(raw_records):
        record, error = validate_record(raw)
        if record is None:
            invalid += 1
            logger.warning("Skipping invalid record #%d: %s", index, error)
        else:
            candidates.append(record)

    existing = set()
    if candidates:
        ids = {c.drone_id for c in candidates}
        existing = set(
            db.execute(
                select(DroneRecord.drone_id, DroneRecord.timestamp).where(DroneRecord.drone_id.in_(ids))
            ).all()
        )

    for record in candidates:
        key = (record.drone_id, record.timestamp)
        if key in existing:
            duplicates += 1
            continue
        existing.add(key)
        db.add(DroneRecord(**record.model_dump()))
        valid += 1

    run.valid_records = valid
    run.invalid_records = invalid
    run.duplicate_records = duplicates


def execute_run(
    run_id: int,
    session_factory: Callable[[], Session],
    input_file: Path,
    extra_source: Callable[[Session], list] | None = None,
) -> None:
    """Run the full pipeline for an existing 'started' run; always records a final status.

    `extra_source` optionally supplies simulated live telemetry. The input file is then used
    only for the initial load (while the source has nothing to offer, i.e. the DB is empty).
    """
    db = session_factory()
    try:
        run = db.get(PipelineRun, run_id)
        try:
            fresh = extra_source(db) if extra_source else []
            # The file is only the initial load: once the DB has data, the mock supplies the records.
            records = fresh or load_records(input_file)
            process(db, records, run)
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
