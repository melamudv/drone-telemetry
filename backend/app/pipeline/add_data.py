"""One-shot batch for the Add data button: 10 records, validated before they are stored."""

import math
import random
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DroneRecord
from app.pipeline.mock_source import _as_raw, _latest_per_drone
from app.pipeline.runner import _remember_reject
from app.pipeline.validation import validate_record

BATCH_SIZE = 10
NEW_DRONES = 1
DUPLICATES = 2
NEARBY_POINTS = BATCH_SIZE - NEW_DRONES - DUPLICATES
# About 1.1 km. New points stay inside this radius of a drone's last position.
RADIUS_DEG = 0.01


def _stamp(when: datetime) -> str:
    return when.isoformat() + "Z"


def _next_drone_id(latest: list[DroneRecord]) -> str:
    numbers = [
        int(rec.drone_id.rsplit("-", 1)[1])
        for rec in latest
        if rec.drone_id.rsplit("-", 1)[-1].isdigit()
    ]
    return f"DRONE-{max(numbers, default=0) + 1:03d}"


def _new_drone(latest: list[DroneRecord], now: datetime, rng: random.Random) -> dict:
    types = sorted({rec.drone_type for rec in latest}) or ["Quadcopter"]
    operators = sorted({rec.operator_id for rec in latest}) or ["OP-100"]
    return {
        "drone_id": _next_drone_id(latest),
        "drone_type": rng.choice(types),
        "operator_id": rng.choice(operators),
        "latitude": round(rng.uniform(31.0, 33.0), 4),
        "longitude": round(rng.uniform(34.3, 35.5), 4),
        "altitude_m": round(rng.uniform(50, 300), 1),
        "speed_kmh": round(rng.uniform(20, 90), 1),
        "battery_percent": round(rng.uniform(40, 100), 1),
        "timestamp": _stamp(now),
        "status": "active",
    }


def _near(lat: float, lon: float, rng: random.Random) -> tuple[float, float]:
    angle = rng.uniform(0, 2 * math.pi)
    distance = rng.uniform(0, RADIUS_DEG)
    return (
        max(-90.0, min(90.0, lat + distance * math.cos(angle))),
        max(-180.0, min(180.0, lon + distance * math.sin(angle))),
    )


def _nearby_point(anchor: dict, when: datetime, rng: random.Random) -> dict:
    lat, lon = _near(anchor["latitude"], anchor["longitude"], rng)
    landed = anchor["status"] == "landed"
    battery = anchor["battery_percent"] + rng.uniform(-3, 3)
    return {
        "drone_id": anchor["drone_id"],
        "drone_type": anchor["drone_type"],
        "operator_id": anchor["operator_id"],
        "latitude": round(lat, 5),
        "longitude": round(lon, 5),
        "altitude_m": 0.0 if landed else round(max(0.0, anchor["altitude_m"] + rng.uniform(-5, 5)), 1),
        "speed_kmh": 0.0 if landed else round(max(0.0, anchor["speed_kmh"] + rng.uniform(-3, 3)), 1),
        "battery_percent": round(max(0.0, min(100.0, battery)), 1),
        "timestamp": _stamp(when),
        "status": anchor["status"],
    }


def _as_anchor(rec: DroneRecord) -> dict:
    raw = _as_raw(rec, rec.timestamp)
    raw.pop("timestamp")
    return raw


def build_batch(db: Session, now: datetime, rng: random.Random | None = None) -> list[dict]:
    """10 raw records: 1 new drone, 7 points near existing ones, 2 exact duplicates."""
    rng = rng or random.Random()
    latest = _latest_per_drone(db)
    fresh = _new_drone(latest, now, rng)
    anchors = [_as_anchor(rec) for rec in latest] or [fresh]
    points = [
        _nearby_point(anchors[i % len(anchors)], now + timedelta(seconds=i + 1), rng)
        for i in range(NEARBY_POINTS)
    ]
    if latest:
        duplicates = [_as_raw(latest[i % len(latest)], latest[i % len(latest)].timestamp) for i in range(DUPLICATES)]
    else:
        duplicates = [dict(fresh), dict(fresh)]
    batch = [fresh, *points, *duplicates]
    if len(batch) != BATCH_SIZE:
        raise RuntimeError(f"expected {BATCH_SIZE} records, got {len(batch)}")
    return batch


def store_batch(db: Session, raw_records: list[dict]) -> dict[str, int]:
    """Validate, skip invalid, skip duplicates, store the rest."""
    added = invalid = duplicates = 0
    candidates = []
    for raw in raw_records:
        record, error = validate_record(raw)
        if record is None:
            invalid += 1
            drone_id = raw.get("drone_id") if isinstance(raw, dict) else None
            _remember_reject(db, "invalid", raw, error, drone_id if isinstance(drone_id, str) else None)
        else:
            candidates.append((raw, record))

    existing: set[tuple] = set()
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
        added += 1
    db.commit()
    return {"total": len(raw_records), "added": added, "invalid": invalid, "duplicates": duplicates}
