from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Network(Base):
    __tablename__ = "networks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bssid: Mapped[str] = mapped_column(String(17), unique=True, nullable=False, index=True)
    ssid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    channel: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "2.4GHz" | "5GHz"
    power: Mapped[int | None] = mapped_column(Integer, nullable=True)          # dBm, e.g. -65
    encryption: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "WPA2" | "WEP" | "OPN"
    cipher: Mapped[str | None] = mapped_column(String(20), nullable=True)      # "CCMP" | "TKIP"
    auth: Mapped[str | None] = mapped_column(String(20), nullable=True)        # "PSK" | "MGT"
    wps_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    wps_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    vendor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    handshakes: Mapped[list["Handshake"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Handshake", back_populates="network", cascade="all, delete-orphan"
    )
    credentials: Mapped[list["Credential"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Credential", back_populates="network", cascade="all, delete-orphan"
    )
