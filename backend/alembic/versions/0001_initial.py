"""initial schema

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "drone_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("drone_id", sa.String(64), nullable=False),
        sa.Column("drone_type", sa.String(64), nullable=False),
        sa.Column("operator_id", sa.String(64), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("altitude_m", sa.Float(), nullable=False),
        sa.Column("speed_kmh", sa.Float(), nullable=False),
        sa.Column("battery_percent", sa.Float(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.UniqueConstraint("drone_id", "timestamp", name="uq_drone_timestamp"),
    )
    op.create_index("ix_drone_records_drone_id", "drone_records", ["drone_id"])
    op.create_index("ix_drone_records_drone_type", "drone_records", ["drone_type"])
    op.create_index("ix_drone_records_operator_id", "drone_records", ["operator_id"])
    op.create_index("ix_drone_records_timestamp", "drone_records", ["timestamp"])
    op.create_index("ix_drone_records_status", "drone_records", ["status"])
    op.create_index("ix_drone_records_drone_ts", "drone_records", ["drone_id", "timestamp"])

    op.create_table(
        "pipeline_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("total_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invalid_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duplicate_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("pipeline_runs")
    op.drop_table("drone_records")
