import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.tools.base import AsyncToolWrapper


@dataclass
class HashcatProgress:
    """Progress information from hashcat."""
    progress_percent: float = 0.0
    speed: str | None = None
    recovered: str | None = None
    time_started: str | None = None
    time_estimated: str | None = None
    status: str | None = None


# Patterns for parsing hashcat output
PROGRESS_PATTERN = re.compile(r"Progress\.+:\s*(\d+)/(\d+)\s*\((\d+(?:\.\d+)?%)\)")
SPEED_PATTERN = re.compile(r"Speed\.+:\s*(.+)")
RECOVERED_PATTERN = re.compile(r"Recovered\.+:\s*(\d+/\d+)")
STATUS_PATTERN = re.compile(r"Status\.+:\s*(.+)")
TIME_EST_PATTERN = re.compile(r"Time\.Estimated\.+:\s*(.+)")
# WPA hash format: WPA*TYPE*PMKID*MAC_AP*MAC_STA*ESSID*...:password
CRACKED_PATTERN = re.compile(r"WPA\*[^:]+:(.+)$", re.MULTILINE)
# Alternative patterns for cracked passwords
CRACKED_ALT_PATTERNS = [
    re.compile(r"[a-f0-9]{32}\*[a-f0-9\*]+:(.+)$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"\$WPAPSK\$[^:]+:(.+)$", re.MULTILINE),
    re.compile(r"Cracking\s+.*:\s+(.+)$", re.MULTILINE),
]


class HashcatTool(AsyncToolWrapper):
    """Wrapper for hashcat — GPU-accelerated offline cracking."""

    binary = "hashcat"
    default_timeout = 7200  # 2 hours for cracking

    async def crack_wpa(
        self,
        hash_file: str,
        wordlist: str,
        session_name: str = "wifi_suite",
        timeout: int | None = None,
    ) -> AsyncIterator[str]:
        """Dictionary attack against a WPA PMKID/EAPOL hash file (mode 22000).

        Args:
            hash_file: Path to the .hc22000 file.
            wordlist: Path to the wordlist.
            session_name: Hashcat session name (for restore).
            timeout: Optional timeout in seconds.

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
            "--potfile-disable",  # Don't use potfile for cleaner output
            "-o", "/dev/stdout",  # Output cracked to stdout
            hash_file,
            wordlist,
        ]
        async for line in self.stream(args, merge_stderr=True, timeout=timeout):
            yield line

    async def crack_mask(
        self,
        hash_file: str,
        mask: str,
        session_name: str = "wifi_suite_mask",
        timeout: int | None = None,
    ) -> AsyncIterator[str]:
        """Mask (brute-force) attack against a WPA hash file (mode 22000).

        Args:
            hash_file: Path to the .hc22000 file.
            mask: Hashcat mask pattern, e.g. ``?d?d?d?d?d?d?d?d``.
            session_name: Hashcat session name.
            timeout: Optional timeout in seconds.

        Yields:
            Output lines.
        """
        args = [
            "-m", "22000",
            "-a", "3",           # mask attack
            "--session", session_name,
            "--status",
            "--status-timer=5",
            "--potfile-disable",
            "-o", "/dev/stdout",
            hash_file,
            mask,
        ]
        async for line in self.stream(args, merge_stderr=True, timeout=timeout):
            yield line

    def parse_cracked(self, output: str) -> str | None:
        """Extract the cracked password from hashcat output.

        Returns:
            The plaintext password, or None.
        """
        # Primary pattern: WPA hash format
        match = CRACKED_PATTERN.search(output)
        if match:
            return match.group(1).strip()

        # Try alternative patterns
        for pattern in CRACKED_ALT_PATTERNS:
            match = pattern.search(output)
            if match:
                return match.group(1).strip()

        # Last resort: look for "Recovered: 1/1" and extract from nearby context
        if "Recovered" in output and "1/1" in output:
            # The password might be on a line by itself after the hash
            lines = output.split('\n')
            for i, line in enumerate(lines):
                if ':' in line and not line.startswith('[') and not line.startswith('Session'):
                    # Potential hash:password line
                    parts = line.rsplit(':', 1)
                    if len(parts) == 2 and parts[1].strip():
                        pwd = parts[1].strip()
                        # Sanity check: WPA passwords are 8-63 chars
                        if 8 <= len(pwd) <= 63:
                            return pwd

        return None

    def parse_progress(self, line: str) -> HashcatProgress | None:
        """Parse progress information from a single output line.

        Returns:
            HashcatProgress if progress info is found, None otherwise.
        """
        progress = HashcatProgress()
        found_info = False

        # Extract progress percentage
        prog_match = PROGRESS_PATTERN.search(line)
        if prog_match:
            progress.progress_percent = float(prog_match.group(3).rstrip('%'))
            found_info = True

        # Extract speed
        speed_match = SPEED_PATTERN.search(line)
        if speed_match:
            progress.speed = speed_match.group(1).strip()
            found_info = True

        # Extract recovered count
        rec_match = RECOVERED_PATTERN.search(line)
        if rec_match:
            progress.recovered = rec_match.group(1)
            found_info = True

        # Extract status
        status_match = STATUS_PATTERN.search(line)
        if status_match:
            progress.status = status_match.group(1).strip()
            found_info = True

        # Extract time estimate
        time_match = TIME_EST_PATTERN.search(line)
        if time_match:
            progress.time_estimated = time_match.group(1).strip()
            found_info = True

        return progress if found_info else None

    def is_cracked(self, line: str) -> bool:
        """Check if a line indicates successful crack."""
        return bool(CRACKED_PATTERN.search(line)) or any(p.search(line) for p in CRACKED_ALT_PATTERNS)
