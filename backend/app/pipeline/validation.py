from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

ALLOWED_STATUSES = {"active", "landed", "lost_signal"}


class DroneInput(BaseModel):
    """Validates and normalizes one raw telemetry record."""

    model_config = ConfigDict(str_strip_whitespace=True)

    drone_id: str = Field(min_length=1)
    drone_type: str = Field(min_length=1)
    operator_id: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude_m: float = Field(ge=0)
    speed_kmh: float = Field(default=0, ge=0)
    battery_percent: float = Field(ge=0, le=100)
    timestamp: datetime
    status: str

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.strip().lower().replace(" ", "_")
            if v not in ALLOWED_STATUSES:
                raise ValueError(f"must be one of {sorted(ALLOWED_STATUSES)}")
        return v

    @field_validator("timestamp", mode="after")
    @classmethod
    def to_naive_utc(cls, v: datetime) -> datetime:
        # Naive inputs are assumed to already be UTC.
        if v.tzinfo is not None:
            v = v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


def validate_record(raw: Any) -> tuple[DroneInput | None, str | None]:
    """Return (record, None) when valid, otherwise (None, human-readable error)."""
    if not isinstance(raw, dict):
        return None, "record is not a JSON object"
    try:
        return DroneInput.model_validate(raw), None
    except ValidationError as exc:
        msg = "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or 'record'}: {e['msg']}" for e in exc.errors()
        )
        return None, msg
