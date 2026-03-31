from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NetworkBase(BaseModel):
    bssid: str
    ssid: str | None = None
    channel: int | None = None
    frequency: str | None = None
    power: int | None = None
    encryption: str | None = None
    cipher: str | None = None
    auth: str | None = None
    wps_enabled: bool = False
    wps_locked: bool = False
    vendor: str | None = None


class NetworkResponse(NetworkBase):
    id: int
    first_seen: datetime
    last_seen: datetime

    model_config = ConfigDict(from_attributes=True)


class NetworkScanRequest(BaseModel):
    interface: str
    duration: int = 60  # seconds


class NetworkScanResult(BaseModel):
    """Result of a completed network scan."""
    networks_found: int
    networks: list[NetworkResponse]
