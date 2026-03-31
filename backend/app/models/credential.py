from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Credential(Base):
    __tablename__ = "credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    network_id: Mapped[int] = mapped_column(Integer, ForeignKey("networks.id"), nullable=False)
    password: Mapped[str] = mapped_column(String(256), nullable=False)
    wps_pin: Mapped[str | None] = mapped_column(String(8), nullable=True)
    attack_type: Mapped[str] = mapped_column(String(30), nullable=False)  # "wpa_handshake"|"wps_pixie"|"pmkid"
    cracked_by: Mapped[str] = mapped_column(String(20), nullable=False)   # "aircrack-ng"|"hashcat"
    found_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    network: Mapped["Network"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Network", back_populates="credentials"
    )
