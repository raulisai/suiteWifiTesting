import re
from collections.abc import AsyncIterator

from app.tools.base import AsyncToolWrapper


class HashcatTool(AsyncToolWrapper):
    """Wrapper for hashcat — GPU-accelerated offline cracking."""

    binary = "hashcat"

    async def crack_wpa(
        self,
        hash_file: str,
        wordlist: str,
        session_name: str = "wifi_suite",
    ) -> AsyncIterator[str]:
        """Dictionary attack against a WPA PMKID/EAPOL hash file (mode 22000).

        Args:
            hash_file: Path to the .hc22000 file.
            wordlist: Path to the wordlist.
            session_name: Hashcat session name (for restore).

        Yields:
            Output lines from hashcat.
        """
        args = [
            "-m", "22000",
            "-a", "0",           # dictionary attack
            "--session", session_name,
            "--status",
            "--status-timer=5",
            "-w", "3",           # workload profile: high
            hash_file,
            wordlist,
        ]
        async for line in self.stream(args, merge_stderr=True):
            yield line

    async def crack_mask(
        self,
        hash_file: str,
        mask: str,
        session_name: str = "wifi_suite_mask",
    ) -> AsyncIterator[str]:
        """Mask (brute-force) attack against a WPA hash file (mode 22000).

        Args:
            hash_file: Path to the .hc22000 file.
            mask: Hashcat mask pattern, e.g. ``?d?d?d?d?d?d?d?d``.
            session_name: Hashcat session name.

        Yields:
            Output lines.
        """
        args = [
            "-m", "22000",
            "-a", "3",           # mask attack
            "--session", session_name,
            "--status",
            "--status-timer=5",
            hash_file,
            mask,
        ]
        async for line in self.stream(args, merge_stderr=True):
            yield line

    def parse_cracked(self, output: str) -> str | None:
        """Extract the cracked password from hashcat output.

        Returns:
            The plaintext password, or None.
        """
        # hashcat prints: hash:password  in the output
        match = re.search(r"[a-f0-9\*]+:(.+)$", output, re.MULTILINE)
        if match:
            return match.group(1).strip()

        # Also check "Recovered........: 1/1 (100.00%) Digests"
        if "Recovered" in output and "1/1" in output:
            # Try potfile pattern
            pot_match = re.search(r"\$WPAPSK\$[^:]+:(.+)$", output, re.MULTILINE)
            if pot_match:
                return pot_match.group(1).strip()
        return None
