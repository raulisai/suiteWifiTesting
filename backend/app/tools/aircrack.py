import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.tools.base import AsyncToolWrapper


@dataclass
class CrackProgress:
    """Progress information from aircrack-ng."""
    keys_tested: int = 0
    keys_per_second: float = 0.0
    current_key: str | None = None
    time_elapsed: str | None = None


# Patterns for parsing aircrack-ng output
KEYS_TESTED_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*k(?:eys)?\s*tested", re.IGNORECASE)
SPEED_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*k(?:/s|eys?/s)", re.IGNORECASE)
CURRENT_KEY_PATTERN = re.compile(r"Current passphrase:\s*(.+)", re.IGNORECASE)
KEY_FOUND_PATTERN = re.compile(r"KEY FOUND!\s*\[\s*(.*?)\s*\]")


class AircrackTool(AsyncToolWrapper):
    """Wrapper for aircrack-ng — offline WPA2/WEP cracking."""

    binary = "aircrack-ng"
    default_timeout = 3600  # 1 hour for cracking

    async def verify_handshake(
        self, cap_file: str, bssid: str | None = None
    ) -> tuple[bool, str | None]:
        """Check whether *cap_file* contains a valid WPA handshake.

        Args:
            cap_file: Path to the .cap file.
            bssid:    If given, pass ``-b bssid`` to filter to a specific AP.

        Returns:
            Tuple of (has_handshake: bool, bssid: str | None).
        """
        # Pass /dev/null as wordlist so aircrack-ng runs non-interactively and
        # exits immediately after printing the handshake count.  Without -w it
        # blocks on stdin waiting for the user to pick a network / wordlist,
        # causing every verification attempt to hang for the full timeout.
        args: list[str] = ["-w", "/dev/null"]
        if bssid:
            args += ["-b", bssid]
        args.append(cap_file)

        rc, stdout, stderr = await self.run(args, timeout=15)
        output = stdout + stderr

        # aircrack-ng prints "WPA (N handshake)" in the network list.
        # We must check for N > 0 — "0 handshake" must NOT match.
        # Pattern examples from aircrack-ng output:
        #   "WPA (1 handshake)"   → found
        #   "WPA (0 handshake)"   → NOT found
        #   "No valid WPA handshakes found"  → NOT found
        count_match = re.search(r"\((\d+)\s+handshake", output, re.IGNORECASE)
        if count_match and int(count_match.group(1)) > 0:
            bssid_match = re.search(
                r"([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:"
                r"[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})",
                output,
            )
            found_bssid = bssid_match.group(1) if bssid_match else None
            return True, found_bssid
        return False, None

    async def crack(
        self,
        cap_file: str,
        wordlist: str,
        bssid: str | None = None,
        timeout: int | None = None,
    ) -> AsyncIterator[str]:
        """Start dictionary attack against a captured handshake.

        Yields each output line; the KEY FOUND line is included when successful.

        Args:
            cap_file: Path to the .cap / .hc22000 file.
            wordlist: Path to the wordlist file.
            bssid: Optional BSSID filter (-b flag).
            timeout: Optional timeout in seconds.
        """
        args = ["-w", wordlist]
        if bssid:
            args += ["-b", bssid]
        args.append(cap_file)

        async for line in self.stream(args, merge_stderr=True, timeout=timeout):
            yield line

    def parse_key_found(self, output: str) -> str | None:
        """Extract the cracked key from aircrack-ng output.

        Returns:
            The plaintext key or None if not found.
        """
        match = KEY_FOUND_PATTERN.search(output)
        return match.group(1) if match else None

    def parse_progress(self, line: str) -> CrackProgress | None:
        """Parse progress information from a single output line.

        Returns:
            CrackProgress if progress info is found, None otherwise.
        """
        progress = CrackProgress()
        found_info = False

        # Extract keys tested
        keys_match = KEYS_TESTED_PATTERN.search(line)
        if keys_match:
            # Value is in thousands (k)
            progress.keys_tested = int(float(keys_match.group(1)) * 1000)
            found_info = True

        # Extract speed
        speed_match = SPEED_PATTERN.search(line)
        if speed_match:
            progress.keys_per_second = float(speed_match.group(1)) * 1000
            found_info = True

        # Extract current passphrase being tested
        current_match = CURRENT_KEY_PATTERN.search(line)
        if current_match:
            progress.current_key = current_match.group(1).strip()
            found_info = True

        return progress if found_info else None

    def is_key_found(self, line: str) -> bool:
        """Check if a line indicates the key was found."""
        return "KEY FOUND!" in line
