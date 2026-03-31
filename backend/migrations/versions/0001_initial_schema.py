"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # networks
    op.create_table(
        "networks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bssid", sa.String(17), nullable=False),
        sa.Column("ssid", sa.String(255), nullable=True),
        sa.Column("channel", sa.Integer(), nullable=True),
        sa.Column("frequency", sa.String(10), nullable=True),
        sa.Column("power", sa.Integer(), nullable=True),
        sa.Column("encryption", sa.String(20), nullable=True),
        sa.Column("cipher", sa.String(20), nullable=True),
        sa.Column("auth", sa.String(20), nullable=True),
        sa.Column("wps_enabled", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("wps_locked", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("vendor", sa.String(100), nullable=True),
        sa.Column("first_seen", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bssid"),
    )
    op.create_index("ix_networks_id", "networks", ["id"])
    op.create_index("ix_networks_bssid", "networks", ["bssid"])

    # campaigns
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "paused", "completed", "failed", name="campaign_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("interface", sa.String(20), nullable=False),
        sa.Column("wordlist", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_campaigns_id", "campaigns", ["id"])

    # campaign_targets
    op.create_table(
        "campaign_targets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("network_id", sa.Integer(), nullable=False),
        sa.Column("attack_types", sa.JSON(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "attacking", "cracking", "done", "failed", name="target_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_campaign_targets_id", "campaign_targets", ["id"])

    # handshakes
    op.create_table(
        "handshakes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("network_id", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column(
            "file_type",
            sa.Enum("cap", "pcapng", "hc22000", name="handshake_file_type"),
            nullable=False,
        ),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("captured_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_handshakes_id", "handshakes", ["id"])

    # credentials
    op.create_table(
        "credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("network_id", sa.Integer(), nullable=False),
        sa.Column("password", sa.String(256), nullable=False),
        sa.Column("wps_pin", sa.String(8), nullable=True),
        sa.Column("attack_type", sa.String(30), nullable=False),
        sa.Column("cracked_by", sa.String(20), nullable=False),
        sa.Column("found_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_credentials_id", "credentials", ["id"])


def downgrade() -> None:
    op.drop_table("credentials")
    op.drop_table("handshakes")
    op.drop_table("campaign_targets")
    op.drop_table("campaigns")
    op.drop_table("networks")
