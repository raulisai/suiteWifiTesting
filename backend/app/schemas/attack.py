from datetime import datetime

from pydantic import BaseModel


class HandshakeAttackRequest(BaseModel):
    interface: str
    bssid: str
    channel: int
    client_mac: str | None = None  # targeted deauth; None = broadcast
    deauth_count: int = 64          # increased for better client disconnection
    capture_timeout: int = 300
    max_retries: int = 5            # attempt up to N times before giving up


class WpsAttackRequest(BaseModel):
    interface: str
    bssid: str
    channel: int
    mode: str = "pixie"  # "pixie" | "bruteforce"
    timeout: int = 300


class PmkidAttackRequest(BaseModel):
    interface: str
    bssid: str | None = None  # None = capture all
    timeout: int = 120


class ScanClientsRequest(BaseModel):
    interface: str
    bssid: str
    channel: int
    duration: int = 15   # seconds to run airodump-ng for client discovery


class CrackRequest(BaseModel):
    handshake_id: int
    wordlist: str | None = None      # override default wordlist
    use_hashcat: bool = False
    mask: str | None = None          # hashcat mask mode


# Union type used by the router
AttackRequest = HandshakeAttackRequest | WpsAttackRequest | PmkidAttackRequest | CrackRequest


class AttackStatus(BaseModel):
    id: str
    attack_type: str   # "wpa_handshake" | "wps_pixie" | "pmkid" | "crack"
    status: str        # "running" | "stopped" | "done" | "failed"
    started_at: datetime
    bssid: str | None = None
    result: dict | None = None


class AttackResponse(BaseModel):
    attack_id: str
    message: str
    websocket_url: str
