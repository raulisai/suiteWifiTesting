from pydantic import BaseModel


class WifiInterface(BaseModel):
    name: str                    # e.g. "wlan0", "wlan0mon"
    phy: str                     # e.g. "phy#3"
    ifindex: int
    addr: str | None = None      # MAC address
    type: str | None = None      # "managed" | "monitor" | "AP" etc.
    channel: int | None = None
    frequency: float | None = None   # MHz
    ssid: str | None = None
    txpower: float | None = None     # dBm


class ToolCheckResponse(BaseModel):
    name: str
    binary: str
    category: str       # "essential" | "optional" | "system"
    apt_package: str
    description: str
    status: str         # "installed" | "missing" | "installing" | "failed"
    version: str | None = None


class EnvironmentSummary(BaseModel):
    ready: bool                         # True if all essential tools are installed
    essential_total: int
    essential_installed: int
    optional_total: int
    optional_installed: int
    system_total: int
    system_installed: int


class ToolInstallRequest(BaseModel):
    binaries: list[str] | None = None   # None = install all missing
    only_missing: bool = True
