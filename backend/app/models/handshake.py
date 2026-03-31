from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

FileTypeEnum = Enum("cap", "pcapng", "hc22000", name="handshake_file_type")


class Handshake(Base):
    __tablename__ = "handshakes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    network_id: Mapped[int] = mapped_column(Integer, ForeignKey("networks.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(FileTypeEnum, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    network: Mapped["Network"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Network", back_populates="handshakes"
    )
