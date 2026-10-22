import math
from datetime import datetime

from sqlalchemy import func, select

from app.models import DroneRecord
from app.pipeline import add_data


def test_add_data_inserts_new_drone_and_nearby_points(loaded, session_factory):
    before = loaded.get("/api/drones?page_size=1000").json()["total"]
    resp = loaded.post("/api/addData")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"total": 10, "added": 8, "invalid": 0, "duplicates": 2}

    after = loaded.get("/api/drones?latest_only=true&page_size=1000").json()
    assert after["total"] == 6  # 5 from the file + 1 new drone
    assert loaded.get("/api/drones?page_size=1000").json()["total"] == before + 8

    db = session_factory()
    latest = {
        rec.drone_id: rec
        for rec in db.scalars(select(DroneRecord).order_by(DroneRecord.timestamp))
    }
    new_id = max(latest, key=lambda drone_id: int(drone_id.rsplit("-", 1)[1]))
    assert new_id not in {"DRONE-001", "DRONE-002", "DRONE-003", "DRONE-004", "DRONE-005"}

    previous = {
        rec.drone_id: (rec.latitude, rec.longitude)
        for rec in db.scalars(
            select(DroneRecord).where(DroneRecord.timestamp < datetime(2026, 7, 1))
        )
    }
    fresh_points = db.scalars(
        select(DroneRecord).where(
            DroneRecord.timestamp >= datetime(2026, 10, 1),
            DroneRecord.drone_id != new_id,
        )
    ).all()
    assert len(fresh_points) == 7
    for point in fresh_points:
        old_lat, old_lon = previous[point.drone_id]
        assert math.hypot(point.latitude - old_lat, point.longitude - old_lon) <= add_data.RADIUS_DEG + 1e-9
    db.close()


def test_add_data_on_empty_db_still_returns_ten_rows(client, session_factory):
    resp = client.post("/api/addData")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"total": 10, "added": 8, "invalid": 0, "duplicates": 2}
    db = session_factory()
    drones = db.scalar(select(func.count(func.distinct(DroneRecord.drone_id))))
    rows = db.scalar(select(func.count(DroneRecord.id)))
    assert drones == 1
    assert rows == 8
    db.close()
