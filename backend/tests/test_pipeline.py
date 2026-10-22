from tests.conftest import valid, write_input


def last_run(client):
    return client.get("/api/pipeline/runs").json()[0]


def test_run_counts_valid_invalid_and_duplicates(loaded):
    run = last_run(loaded)
    assert run["status"] == "completed"
    assert run["total_records"] == 13
    assert run["valid_records"] == 9
    assert run["invalid_records"] == 3
    assert run["duplicate_records"] == 1
    assert run["finished_at"] is not None
    assert run["error_message"] is None


def test_rerun_rechecks_db_rows_and_inserts_nothing(session_factory, input_file):
    from sqlalchemy import func, select

    from app.models import DroneRecord, PipelineRun
    from app.pipeline import runner

    db = session_factory()
    runner.execute_run(runner.start_run(db).id, session_factory, input_file)
    before = db.scalar(select(func.count(DroneRecord.id)))
    runner.execute_run(runner.start_run(db).id, session_factory, input_file, runner.records_from_db)
    db.expire_all()
    run = db.scalars(select(PipelineRun).order_by(PipelineRun.id.desc())).first()
    assert run.status == "completed"
    assert run.total_records == 13
    assert run.valid_records == before
    assert run.invalid_records == 3
    assert run.duplicate_records == 1
    assert db.scalar(select(func.count(DroneRecord.id))) == before
    db.close()


def test_rerun_is_idempotent(loaded):
    loaded.post("/api/pipeline/run")
    run = last_run(loaded)
    assert run["valid_records"] == 9
    assert run["invalid_records"] == 3
    assert run["duplicate_records"] == 1
    assert loaded.get("/api/drones?page_size=1000").json()["total"] == 9


def test_missing_file_marks_run_failed(client, input_file):
    input_file.unlink()
    assert client.post("/api/pipeline/run").status_code == 202
    run = last_run(client)
    assert run["status"] == "failed"
    assert "FileNotFoundError" in run["error_message"]


def test_non_array_input_marks_run_failed(client, input_file):
    input_file.write_text('{"a": 1}', encoding="utf-8")
    client.post("/api/pipeline/run")
    run = last_run(client)
    assert run["status"] == "failed"
    assert "array" in run["error_message"]


def test_malformed_json_marks_run_failed(client, input_file):
    input_file.write_text("{not json", encoding="utf-8")
    client.post("/api/pipeline/run")
    assert last_run(client)["status"] == "failed"


def test_all_invalid_still_completes(client, input_file):
    write_input(input_file, [valid(latitude=500), valid(status="x")])
    client.post("/api/pipeline/run")
    run = last_run(client)
    assert (run["status"], run["valid_records"], run["invalid_records"]) == ("completed", 0, 2)


def test_concurrent_run_rejected(client, session_factory):
    from app.pipeline import runner

    with session_factory() as db:
        runner.start_run(db)
    assert client.post("/api/pipeline/run").status_code == 409


def test_stale_started_run_does_not_block(client, session_factory):
    from datetime import timedelta

    from app.pipeline import runner

    with session_factory() as db:
        run = runner.start_run(db)
        run.started_at = runner.utcnow() - timedelta(minutes=10)
        db.commit()
    assert client.post("/api/pipeline/run").status_code == 202


def test_runs_listed_newest_first(loaded):
    loaded.post("/api/pipeline/run")
    ids = [r["id"] for r in loaded.get("/api/pipeline/runs").json()]
    assert ids == sorted(ids, reverse=True) and len(ids) == 2
