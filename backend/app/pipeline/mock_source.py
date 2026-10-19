"""Simulated live telemetry: every pipeline run receives a fresh batch of readings."""

import random
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DroneRecord


def _latest_per_drone(db: Session) -> list[DroneRecord]:
    latest: dict[str, DroneRecord] = {}
    for rec in db.scalars(select(DroneRecord).order_by(DroneRecord.timestamp)):
        latest[rec.drone_id] = rec
    return list(latest.values())


def _as_raw(rec: DroneRecord, timestamp: datetime) -> dict:
    return {
        "drone_id": rec.drone_id,
        "drone_type": rec.drone_type,
        "operator_id": rec.operator_id,
        "latitude": rec.latitude,
        "longitude": rec.longitude,
        "altitude_m": rec.altitude_m,
        "speed_kmh": rec.speed_kmh,
        "battery_percent": rec.battery_percent,
        "timestamp": timestamp.isoformat() + "Z",
        "status": rec.status,
    }


STATUSES = ("active", "lost_signal", "landed")


def _set_status(reading: dict, status: str) -> None:
    reading["status"] = status
    if status == "landed":
        reading.update(altitude_m=0, speed_kmh=0)
    elif status == "active" and reading["speed_kmh"] == 0:
        reading.update(altitude_m=max(reading["altitude_m"], 50), speed_kmh=30)


def _next_reading(prev: DroneRecord, now: datetime, rng: random.Random) -> dict:
    """Move a drone a little from its last known state, with occasional status changes."""
    reading = _as_raw(prev, now)
    roll = rng.random()
    status = prev.status
    if status == "active" and roll < 0.15:
        status = "lost_signal"
    elif status == "lost_signal" and roll < 0.4:
        status = "active"
    elif status == "landed" and roll < 0.15:
        status = "active"

    if status == "landed":
        reading["battery_percent"] = min(100.0, prev.battery_percent + rng.uniform(5, 15))
    else:
        reading["battery_percent"] = max(10.0, prev.battery_percent - rng.uniform(1, 4))
        reading["latitude"] = max(-90.0, min(90.0, prev.latitude + rng.uniform(-0.004, 0.004)))
        reading["longitude"] = max(-180.0, min(180.0, prev.longitude + rng.uniform(-0.004, 0.004)))
        reading["altitude_m"] = max(0.0, prev.altitude_m + rng.uniform(-8, 8))
        reading["speed_kmh"] = max(0.0, prev.speed_kmh + rng.uniform(-5, 5))
    _set_status(reading, status)
    return reading


def _ensure_all_statuses(batch: list[dict]) -> None:
    """Keep the demo readable: if drones can cover every status, make sure each one shows up."""
    if len(batch) < len(STATUSES):
        return
    for missing in STATUSES:
        counts = {s: sum(1 for r in batch if r["status"] == s) for s in STATUSES}
        if counts[missing]:
            continue
        donor = next(r for r in batch if counts[r["status"]] > 1)
        _set_status(donor, missing)


MAX_DRONES = 20
DEFAULT_TYPES = ("Quadcopter", "Fixed Wing", "Hexacopter", "VTOL")


def _new_drones(latest: list[DroneRecord], now: datetime, rng: random.Random) -> list[dict]:
    """1-2 drones that appear for the first time (capped so the map does not fill up forever)."""
    room = MAX_DRONES - len(latest)
    if room <= 0:
        return []
    numbers = [
        int(rec.drone_id.rsplit("-", 1)[1]) for rec in latest if rec.drone_id.rsplit("-", 1)[-1].isdigit()
    ]
    next_number = max(numbers, default=0) + 1
    types = sorted({rec.drone_type for rec in latest}) or list(DEFAULT_TYPES)
    operators = sorted({rec.operator_id for rec in latest})
    fresh = []
    for offset in range(min(rng.randint(1, 2), room)):
        fresh.append(
            {
                "drone_id": f"DRONE-{next_number + offset:03d}",
                "drone_type": rng.choice(types),
                "operator_id": rng.choice(operators),
                "latitude": round(rng.uniform(31.0, 33.0), 4),
                "longitude": round(rng.uniform(34.3, 35.5), 4),
                "altitude_m": round(rng.uniform(50, 300), 1),
                "speed_kmh": round(rng.uniform(20, 90), 1),
                "battery_percent": round(rng.uniform(40, 100), 1),
                "timestamp": now.isoformat() + "Z",
                "status": "active",
            }
        )
    return fresh


def generate_batch(db: Session, now: datetime, rng: random.Random | None = None) -> list[dict]:
    """One new reading per known drone, 1-2 brand-new drones, plus a duplicate and an invalid
    record so that every counter of the run (valid / invalid / duplicate) is exercised."""
    rng = rng or random.Random()
    latest = _latest_per_drone(db)
    if not latest:
        return []

    batch = [_next_reading(prev, now, rng) for prev in latest]
    _ensure_all_statuses(batch)
    batch += _new_drones(latest, now, rng)
    batch.append(_as_raw(latest[0], latest[0].timestamp))
    batch.append({**batch[0], "battery_percent": 150, "status": "flying"})
    return batch
