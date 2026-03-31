from collections.abc import AsyncIterator

from app.tools.base import AsyncToolWrapper


class AireplayTool(AsyncToolWrapper):
    """Wrapper for aireplay-ng — traffic injection and deauthentication."""

    binary = "aireplay-ng"

    async def deauth(
        self,
        interface: str,
        bssid: str,
        count: int = 10,
        client_mac: str | None = None,
    ) -> AsyncIterator[str]:
        """Send deauthentication frames to disconnect a client.

        Args:
            interface: Monitor-mode interface.
            bssid: Target AP MAC address.
            count: Number of deauth packets (0 = infinite).
            client_mac: Specific client to deauth; None = broadcast.

        Yields:
            Output lines from aireplay-ng.
        """
        args = ["-0", str(count), "-a", bssid]
        if client_mac:
            args += ["-c", client_mac]
        args.append(interface)

        async for line in self.stream(args, merge_stderr=True):
            yield line

    async def fake_auth(
        self,
        interface: str,
        bssid: str,
        source_mac: str,
    ) -> AsyncIterator[str]:
        """Perform a fake authentication (needed for WEP/ARP injection).

        Args:
            interface: Monitor-mode interface.
            bssid: Target AP MAC address.
            source_mac: MAC to use as the client.

        Yields:
            Output lines from aireplay-ng.
        """
        args = ["-1", "0", "-a", bssid, "-h", source_mac, interface]
        async for line in self.stream(args, merge_stderr=True):
            yield line

    async def arp_replay(
        self,
        interface: str,
        bssid: str,
        source_mac: str,
    ) -> AsyncIterator[str]:
        """ARP replay attack for WEP cracking (attack -3).

        Yields:
            Output lines.
        """
        args = ["-3", "-b", bssid, "-h", source_mac, interface]
        async for line in self.stream(args, merge_stderr=True):
            yield line
