from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DroneRecord(Base):
    """One telemetry point. A drone's history is all rows sharing a drone_id."""

    __tablename__ = "drone_records"
    __table_args__ = (
        UniqueConstraint("drone_id", "timestamp", name="uq_drone_timestamp"),
        Index("ix_drone_records_drone_ts", "drone_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    drone_id: Mapped[str] = mapped_column(String(64), index=True)
    drone_type: Mapped[str] = mapped_column(String(64), index=True)
    operator_id: Mapped[str] = mapped_column(String(64), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    altitude_m: Mapped[float] = mapped_column(Float)
    speed_kmh: Mapped[float] = mapped_column(Float)
    battery_percent: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)  # naive UTC
    status: Mapped[str] = mapped_column(String(32), index=True)


class RejectedRecord(Base):
    """A row the pipeline checked and did not store: invalid or a duplicate."""

    __tablename__ = "rejected_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    outcome: Mapped[str] = mapped_column(String(16), index=True)  # invalid | duplicate
    drone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text)


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16))  # started | completed | failed
    total_records: Mapped[int] = mapped_column(Integer, default=0)
    valid_records: Mapped[int] = mapped_column(Integer, default=0)
    invalid_records: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_records: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
