import asyncio
import shutil
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum


class ToolCategory(str, Enum):
    ESSENTIAL = "essential"
    OPTIONAL = "optional"
    SYSTEM = "system"


class ToolStatus(str, Enum):
    INSTALLED = "installed"
    MISSING = "missing"
    INSTALLING = "installing"
    FAILED = "failed"


@dataclass
class ToolInfo:
    name: str
    binary: str
    category: ToolCategory
    apt_package: str
    description: str
    status: ToolStatus = ToolStatus.MISSING
    version: str | None = None


# Canonical tool catalog (17 tools)
TOOLS: list[ToolInfo] = [
    # Essential
    ToolInfo("Airmon-ng", "airmon-ng", ToolCategory.ESSENTIAL, "aircrack-ng",
             "Manage monitor mode interfaces"),
    ToolInfo("Airodump-ng", "airodump-ng", ToolCategory.ESSENTIAL, "aircrack-ng",
             "Scan networks and capture handshakes"),
    ToolInfo("Aireplay-ng", "aireplay-ng", ToolCategory.ESSENTIAL, "aircrack-ng",
             "Inject frames and deauthenticate clients"),
    ToolInfo("Aircrack-ng", "aircrack-ng", ToolCategory.ESSENTIAL, "aircrack-ng",
             "Offline WPA2/WEP cracking"),
    ToolInfo("Reaver", "reaver", ToolCategory.ESSENTIAL, "reaver",
             "WPS PIN brute-force and Pixie Dust"),
    ToolInfo("Wash", "wash", ToolCategory.ESSENTIAL, "reaver",
             "Scan for WPS-enabled networks"),
    # Optional
    ToolInfo("HCXDumptool", "hcxdumptool", ToolCategory.OPTIONAL, "hcxdumptool",
             "Client-less PMKID capture"),
    ToolInfo("HCXPcapngTool", "hcxpcapngtool", ToolCategory.OPTIONAL, "hcxtools",
             "Convert .pcapng to Hashcat format"),
    ToolInfo("Hashcat", "hashcat", ToolCategory.OPTIONAL, "hashcat",
             "GPU-accelerated password cracking"),
    ToolInfo("Bully", "bully", ToolCategory.OPTIONAL, "bully",
             "Alternative WPS brute-force tool"),
    ToolInfo("Macchanger", "macchanger", ToolCategory.OPTIONAL, "macchanger",
             "MAC address spoofing"),
    ToolInfo("Hostapd", "hostapd", ToolCategory.OPTIONAL, "hostapd",
             "Create rogue access points (Evil Twin)"),
    ToolInfo("Dnsmasq", "dnsmasq", ToolCategory.OPTIONAL, "dnsmasq",
             "DNS/DHCP server for captive portals"),
    ToolInfo("MDK4", "mdk4", ToolCategory.OPTIONAL, "mdk4",
             "Advanced deauth and beacon flooding"),
    ToolInfo("Crunch", "crunch", ToolCategory.OPTIONAL, "crunch",
             "Custom wordlist generator"),
    # System
    ToolInfo("iw", "iw", ToolCategory.SYSTEM, "iw",
             "Configure wireless interfaces"),
    ToolInfo("Tshark", "tshark", ToolCategory.SYSTEM, "tshark",
             "Verify .cap/.pcapng capture files"),
]

# Map each binary to its apt package (for deduplication during install)
_APT_PACKAGE_MAP: dict[str, str] = {t.binary: t.apt_package for t in TOOLS}


class EnvironmentService:
    """Service for checking and installing external tool dependencies."""

    async def _check_one_inplace(self, tool: ToolInfo) -> None:
        """Update *tool* status and version fields in-place."""
        if not shutil.which(tool.binary):
            tool.status = ToolStatus.MISSING
            tool.version = None
            return

        tool.status = ToolStatus.INSTALLED
        # Try to get version
        try:
            proc = await asyncio.create_subprocess_exec(
                tool.binary, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
            raw = (stdout + stderr).decode(errors="replace").strip()
            first_line = next((l for l in raw.splitlines() if l.strip()), None)
            tool.version = first_line
        except Exception:
            tool.version = None

    async def check_all(self) -> list[ToolInfo]:
        """Verify all 17 tools in parallel.

        Returns:
            Fresh list of ToolInfo with updated status and version.
        """
        tools = [ToolInfo(
            t.name, t.binary, t.category, t.apt_package, t.description
        ) for t in TOOLS]
        await asyncio.gather(*[self._check_one_inplace(t) for t in tools])
        return tools

    async def check_one(self, binary: str) -> ToolInfo | None:
        """Check a single tool by binary name.

        Returns:
            Updated ToolInfo or None if the binary is not in the catalog.
        """
        original = next((t for t in TOOLS if t.binary == binary), None)
        if original is None:
            return None
        tool = ToolInfo(
            original.name, original.binary, original.category,
            original.apt_package, original.description
        )
        await self._check_one_inplace(tool)
        return tool

    async def get_summary(self) -> dict:
        """Return a summary dict suitable for the dashboard badge."""
        tools = await self.check_all()

        essential = [t for t in tools if t.category == ToolCategory.ESSENTIAL]
        optional = [t for t in tools if t.category == ToolCategory.OPTIONAL]
        system = [t for t in tools if t.category == ToolCategory.SYSTEM]

        essential_ok = sum(1 for t in essential if t.status == ToolStatus.INSTALLED)
        optional_ok = sum(1 for t in optional if t.status == ToolStatus.INSTALLED)
        system_ok = sum(1 for t in system if t.status == ToolStatus.INSTALLED)

        return {
            "ready": essential_ok == len(essential),
            "essential_total": len(essential),
            "essential_installed": essential_ok,
            "optional_total": len(optional),
            "optional_installed": optional_ok,
            "system_total": len(system),
            "system_installed": system_ok,
        }

    async def install_stream(
        self,
        binaries: list[str] | None = None,
        only_missing: bool = True,
    ) -> AsyncIterator[str]:
        """Install tools via apt-get, yielding each output line.

        Args:
            binaries: Specific binary names to install; None = all.
            only_missing: If True, skip already-installed tools.
        """
        tools = await self.check_all()

        if binaries is not None:
            targets = [t for t in tools if t.binary in binaries]
        else:
            targets = tools

        if only_missing:
            targets = [t for t in targets if t.status == ToolStatus.MISSING]

        if not targets:
            yield "Todas las herramientas seleccionadas ya están instaladas."
            return

        # Deduplicate apt packages
        packages = list(dict.fromkeys(t.apt_package for t in targets))
        yield f"Instalando paquetes: {', '.join(packages)}"

        proc = await asyncio.create_subprocess_exec(
            "apt-get", "install", "-y", *packages,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={"DEBIAN_FRONTEND": "noninteractive", "PATH": "/usr/sbin:/usr/bin:/sbin:/bin"},
        )

        assert proc.stdout is not None
        async for raw_line in proc.stdout:
            yield raw_line.decode(errors="replace").rstrip()

        await proc.wait()
        rc = proc.returncode or 0
        if rc == 0:
            yield "Instalación completada correctamente."
        else:
            yield f"Error en la instalación (código {rc})."

    async def install_one(self, binary: str) -> tuple[bool, str]:
        """Install a single tool by binary name.

        Returns:
            Tuple of (success: bool, output: str).
        """
        tool = next((t for t in TOOLS if t.binary == binary), None)
        if tool is None:
            return False, f"Binary '{binary}' not found in catalog."

        lines: list[str] = []
        async for line in self.install_stream(binaries=[binary], only_missing=False):
            lines.append(line)

        output = "\n".join(lines)
        success = "completada" in output.lower()
        return success, output


# Module-level singleton
environment_service = EnvironmentService()
