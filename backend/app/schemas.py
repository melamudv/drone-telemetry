from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer

# DB stores naive UTC; always serialize with an explicit 'Z' so clients don't guess the zone.
UtcDatetime = Annotated[
    datetime,
    PlainSerializer(
        lambda d: d.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        return_type=str,
    ),
]


class DroneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    drone_id: str
    drone_type: str
    operator_id: str
    latitude: float
    longitude: float
    altitude_m: float
    speed_kmh: float
    battery_percent: float
    timestamp: UtcDatetime
    status: str


class DronePage(BaseModel):
    items: list[DroneOut]
    total: int
    page: int
    page_size: int


class PipelineRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: UtcDatetime
    finished_at: UtcDatetime | None
    status: str
    total_records: int
    valid_records: int
    invalid_records: int
    duplicate_records: int
    error_message: str | None


class AddDataOut(BaseModel):
    total: int
    added: int
    invalid: int
    duplicates: int


class StatsOut(BaseModel):
    total_records: int
    total_drones: int
    by_status: dict[str, int]
    low_battery_drones: int
    last_run: PipelineRunOut | None
