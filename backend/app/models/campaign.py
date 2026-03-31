from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

CampaignStatusEnum = Enum(
    "pending", "running", "paused", "completed", "failed",
    name="campaign_status",
)

TargetStatusEnum = Enum(
    "pending", "attacking", "cracking", "done", "failed",
    name="target_status",
)


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(CampaignStatusEnum, default="pending")
    interface: Mapped[str] = mapped_column(String(20), nullable=False)
    wordlist: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    targets: Mapped[list["CampaignTarget"]] = relationship(
        "CampaignTarget", back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignTarget(Base):
    __tablename__ = "campaign_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    campaign_id: Mapped[int] = mapped_column(Integer, ForeignKey("campaigns.id"), nullable=False)
    network_id: Mapped[int] = mapped_column(Integer, ForeignKey("networks.id"), nullable=False)
    attack_types: Mapped[list] = mapped_column(JSON, default=list)  # ["wpa_handshake", "wps_pixie", "pmkid"]
    status: Mapped[str] = mapped_column(TargetStatusEnum, default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="targets")
    network: Mapped["Network"] = relationship("Network")  # type: ignore[name-defined]  # noqa: F821
