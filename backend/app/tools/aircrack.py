import re
from collections.abc import AsyncIterator

from app.tools.base import AsyncToolWrapper


class AircrackTool(AsyncToolWrapper):
    """Wrapper for aircrack-ng — offline WPA2/WEP cracking."""

    binary = "aircrack-ng"

    async def verify_handshake(self, cap_file: str) -> tuple[bool, str | None]:
        """Check whether *cap_file* contains a valid WPA handshake.

        Returns:
            Tuple of (has_handshake: bool, bssid: str | None).
        """
        rc, stdout, stderr = await self.run([cap_file])
        output = stdout + stderr

        # aircrack-ng prints: "1 handshake" or lists networks with handshake marker
        if "handshake" in output.lower():
            # Try to extract BSSID
            match = re.search(r"([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:"
                              r"[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})", output)
            bssid = match.group(1) if match else None
            return True, bssid
        return False, None

    async def crack(
        self,
        cap_file: str,
        wordlist: str,
        bssid: str | None = None,
    ) -> AsyncIterator[str]:
        """Start dictionary attack against a captured handshake.

        Yields each output line; the KEY FOUND line is included when successful.

        Args:
            cap_file: Path to the .cap / .hc22000 file.
            wordlist: Path to the wordlist file.
            bssid: Optional BSSID filter (-b flag).
        """
        args = ["-w", wordlist]
        if bssid:
            args += ["-b", bssid]
        args.append(cap_file)

        async for line in self.stream(args, merge_stderr=True):
            yield line

    def parse_key_found(self, output: str) -> str | None:
        """Extract the cracked key from aircrack-ng output.

        Returns:
            The plaintext key or None if not found.
        """
        match = re.search(r"KEY FOUND!\s*\[\s*(.*?)\s*\]", output)
        return match.group(1) if match else None
