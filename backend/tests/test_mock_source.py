import random
from datetime import datetime

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
    assert r.valid_records == 5  # one new reading per drone
    assert r.invalid_records == 3 + 1  # file's invalid ones + the mock invalid
    assert r.duplicate_records >= 1
    db.close()


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

