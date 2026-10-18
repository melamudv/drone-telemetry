import pytest

from app.pipeline.validation import validate_record
from tests.conftest import valid


def test_valid_record_passes():
    record, error = validate_record(valid())
    assert error is None
    assert record.drone_id == "DRONE-001"


@pytest.mark.parametrize(
    "field,value",
    [
        ("drone_id", ""),
        ("drone_id", "   "),
        ("latitude", 91),
        ("latitude", -90.1),
        ("longitude", 180.1),
        ("altitude_m", -1),
        ("battery_percent", 101),
        ("battery_percent", -1),
        ("timestamp", "invalid-date"),
        ("status", "flying"),
        ("speed_kmh", -5),
    ],
)
def test_invalid_values_rejected(field, value):
    record, error = validate_record(valid(**{field: value}))
    assert record is None
    assert field in error


def test_missing_required_field_rejected():
    raw = valid()
    del raw["latitude"]
    record, error = validate_record(raw)
    assert record is None
    assert "latitude" in error


def test_missing_speed_defaults_to_zero():
    raw = valid()
    del raw["speed_kmh"]
    record, _ = validate_record(raw)
    assert record.speed_kmh == 0


@pytest.mark.parametrize(
    "overrides",
    [
        {"battery_percent": 0},
        {"battery_percent": 100},
        {"latitude": 90, "longitude": 180},
        {"latitude": -90, "longitude": -180},
        {"altitude_m": 0},
    ],
)
def test_boundaries_accepted(overrides):
    assert validate_record(valid(**overrides))[1] is None


def test_non_object_rejected():
    assert validate_record("oops")[0] is None


def test_normalization():
    record, _ = validate_record(
        valid(drone_id="  DRONE-9 ", status=" Lost_Signal ", timestamp="2026-06-28T13:30:00+03:00")
    )
    assert record.drone_id == "DRONE-9"
    assert record.status == "lost_signal"
    assert record.timestamp.tzinfo is None
    assert record.timestamp.hour == 10  # converted to UTC
