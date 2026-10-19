import random
from datetime import datetime

from sqlalchemy import select

from app.models import DroneRecord
from app.pipeline import mock_source, runner


def test_mock_batch_adds_new_readings_and_exercises_all_counters(session_factory, input_file):
    db = session_factory()
    run = runner.start_run(db)
    runner.execute_run(run.id, session_factory, input_file)

    now = datetime(2026, 7, 1, 12, 0, 0)
    source = lambda s: mock_source.generate_batch(s, now, random.Random(1))
    run2 = runner.start_run(db)
    runner.execute_run(run2.id, session_factory, input_file, source)

    db.expire_all()
    r = db.get(type(run), run2.id)
    assert r.status == "completed"
    assert r.valid_records in (6, 7)  # one reading per drone + 1-2 new drones
    assert r.invalid_records == 1  # the mock's invalid record; the file is not read again
    assert r.duplicate_records == 1  # the mock's duplicate
    assert r.total_records == r.valid_records + 2
    assert len(runner.load_records(input_file)) == 13  # the file is never modified
    ids = {d.drone_id for d in db.scalars(select(DroneRecord))}
    assert len(ids) == r.valid_records
    db.close()


def test_mock_adds_one_or_two_new_drones_up_to_the_cap(session_factory, input_file):
    db = session_factory()
    runner.execute_run(runner.start_run(db).id, session_factory, input_file)
    for seed in range(5):
        batch = mock_source.generate_batch(db, datetime(2026, 7, 1), random.Random(seed))
        known = {d.drone_id for d in db.scalars(select(DroneRecord))}
        new = {r["drone_id"] for r in batch} - known
        assert len(new) in (1, 2)
    assert mock_source._new_drones([_FakeRec(i) for i in range(mock_source.MAX_DRONES)], datetime(2026, 7, 1), random.Random(0)) == []
    db.close()


class _FakeRec:
    def __init__(self, n):
        self.drone_id, self.drone_type, self.operator_id = f"DRONE-{n:03d}", "VTOL", "OP-1"


def test_mock_batch_always_shows_every_status(session_factory, input_file):
    db = session_factory()
    run = runner.start_run(db)
    runner.execute_run(run.id, session_factory, input_file)
    for seed in range(30):
        batch = mock_source.generate_batch(db, datetime(2026, 7, 1), random.Random(seed))
        fresh = batch[:5]
        assert {r["status"] for r in fresh} == {"active", "lost_signal", "landed"}
    db.close()


def test_mock_batch_empty_without_data(session_factory):
    db = session_factory()
    assert mock_source.generate_batch(db, datetime(2026, 7, 1)) == []
    db.close()

