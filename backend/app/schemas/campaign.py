from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CampaignTargetCreate(BaseModel):
    network_id: int
    attack_types: list[str]  # ["wpa_handshake", "wps_pixie", "pmkid"]


class CampaignCreate(BaseModel):
    name: str
    description: str | None = None
    interface: str
    wordlist: str | None = None
    targets: list[CampaignTargetCreate] = []


class CampaignTargetResponse(BaseModel):
    id: int
    network_id: int
    attack_types: list[str]
    status: str
    started_at: datetime | None
    ended_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class CampaignResponse(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    interface: str
    wordlist: str | None
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    targets: list[CampaignTargetResponse] = []

    model_config = ConfigDict(from_attributes=True)
