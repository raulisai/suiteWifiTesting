import re

from app.tools.base import AsyncToolWrapper


class AirmonTool(AsyncToolWrapper):
    """Wrapper for airmon-ng — manages monitor mode interfaces."""

    binary = "airmon-ng"

    async def check_kill(self) -> str:
        """Kill conflicting processes (NetworkManager, wpa_supplicant).

        Returns:
            Combined stdout+stderr output.
        """
        rc, stdout, stderr = await self.run(["check", "kill"])
        return stdout + stderr

    async def start(self, interface: str) -> str:
        """Activate monitor mode on *interface*.

        Returns:
            Name of the created monitor interface (e.g. ``wlan0mon``).

        Raises:
            RuntimeError: if the monitor interface could not be determined.
        """
        rc, stdout, stderr = await self.run(["start", interface])
        output = stdout + stderr

        # airmon-ng prints something like:
        # "monitor mode vif enabled for [phy0]wlan0 on [phy0]wlan0mon"
        match = re.search(r"enabled.*?on\s+\[[\w]+\](\w+)", output)
        if match:
            return match.group(1)

        # Fallback: guess wlan0 → wlan0mon
        return f"{interface}mon"

    async def stop(self, mon_interface: str) -> str:
        """Deactivate monitor mode on *mon_interface*.

        Returns:
            Combined output.
        """
        rc, stdout, stderr = await self.run(["stop", mon_interface])
        return stdout + stderr

    async def list_interfaces(self) -> list[dict]:
        """Parse ``airmon-ng`` output (no args) for available interfaces.

        Returns:
            List of dicts with keys ``phy``, ``interface``, ``driver``, ``chipset``.
        """
        rc, stdout, stderr = await self.run([])
        interfaces = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line or line.startswith("PHY") or line.startswith("Interface"):
                continue
            parts = line.split()
            if len(parts) >= 3:
                interfaces.append({
                    "phy": parts[0],
                    "interface": parts[1],
                    "driver": parts[2],
                    "chipset": " ".join(parts[3:]) if len(parts) > 3 else "",
                })
        return interfaces
