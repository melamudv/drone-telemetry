import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import pipeline as pipeline_api
from app.database import Base, get_db
from app.main import app

SAMPLE = Path(__file__).resolve().parent.parent / "data" / "drones.json"


def valid(**overrides):
    rec = {
        "drone_id": "DRONE-001",
        "drone_type": "Quadcopter",
        "operator_id": "OP-123",
        "latitude": 32.0853,
        "longitude": 34.7818,
        "altitude_m": 120,
        "speed_kmh": 45,
        "battery_percent": 76,
        "timestamp": "2026-06-28T10:30:00Z",
        "status": "active",
    }
    rec.update(overrides)
    return rec


@pytest.fixture()
def session_factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def input_file(tmp_path):
    path = tmp_path / "input.json"
    path.write_text(SAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
    return path


@pytest.fixture()
def client(session_factory, input_file):
    def override_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[pipeline_api.get_session_factory] = lambda: session_factory
    app.dependency_overrides[pipeline_api.get_input_file] = lambda: input_file
    app.dependency_overrides[pipeline_api.get_extra_source] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def loaded(client):
    """Client with the sample file already ingested."""
    assert client.post("/api/pipeline/run").status_code == 202
    return client


def write_input(path, records):
    path.write_text(json.dumps(records), encoding="utf-8")
