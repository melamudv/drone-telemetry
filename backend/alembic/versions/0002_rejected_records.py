"""rejected records kept so pipeline runs can recount them

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rejected_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("drone_id", sa.String(64), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=False),
    )
    op.create_index("ix_rejected_records_outcome", "rejected_records", ["outcome"])


def downgrade() -> None:
    op.drop_index("ix_rejected_records_outcome", table_name="rejected_records")
    op.drop_table("rejected_records")
