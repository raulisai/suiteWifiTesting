import asyncio
import csv
import os
from collections.abc import AsyncIterator

from app.tools.base import AsyncToolWrapper


class AirodumpTool(AsyncToolWrapper):
    """Wrapper for airodump-ng — scanning and handshake capture."""

    binary = "airodump-ng"

    async def scan_all(self, interface: str, duration: int = 60) -> list[dict]:
        """General scan across all channels. Saves CSV then parses it.

        Args:
            interface: Monitor-mode interface name.
            duration: Scan duration in seconds.

        Returns:
            List of parsed network dicts.
        """
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            prefix = os.path.join(tmpdir, "scan")
            proc = await asyncio.create_subprocess_exec(
                self.binary,
                "--output-format", "csv",
                "-w", prefix,
                interface,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                await asyncio.wait_for(proc.wait(), timeout=duration)
            except asyncio.TimeoutError:
                proc.terminate()
                await proc.wait()

            csv_path = f"{prefix}-01.csv"
            if os.path.exists(csv_path):
                return self.parse_csv(csv_path)
        return []

    async def capture(
        self,
        interface: str,
        bssid: str,
        channel: int,
        output_prefix: str,
    ) -> AsyncIterator[str]:
        """Focused capture on a specific AP. Yields output lines in real time.

        The capture writes ``{output_prefix}-01.cap`` to disk.
        """
        args = [
            "-c", str(channel),
            "--bssid", bssid,
            "-w", output_prefix,
            "--output-format", "cap",
            interface,
        ]
        async for line in self.stream(args, merge_stderr=True):
            yield line

    def parse_csv(self, path: str) -> list[dict]:
        """Parse an airodump-ng CSV file.

        The CSV has two sections separated by a blank line:
        - APs (top section)
        - STATIONs (bottom section)

        Returns:
            List of AP dicts.
        """
        networks = []
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                content = f.read()

            # Split into AP section and STATION section
            sections = content.strip().split("\r\n\r\n")
            if not sections:
                return []

            ap_section = sections[0]
            reader = csv.DictReader(ap_section.splitlines())

            for row in reader:
                # Strip whitespace from keys and values
                row = {k.strip(): v.strip() for k, v in row.items() if k}

                bssid = row.get("BSSID", "").strip()
                if not bssid or bssid == "BSSID":
                    continue

                power_raw = row.get("Power", "").strip()
                try:
                    power = int(power_raw)
                except ValueError:
                    power = None

                channel_raw = row.get("channel", row.get(" channel", "")).strip()
                try:
                    channel = int(channel_raw)
                    frequency = "5GHz" if channel > 14 else "2.4GHz"
                except ValueError:
                    channel = None
                    frequency = None

                networks.append({
                    "bssid": bssid,
                    "ssid": row.get("ESSID", "").strip() or None,
                    "channel": channel,
                    "frequency": frequency,
                    "power": power,
                    "encryption": row.get("Privacy", "").strip() or None,
                    "cipher": row.get("Cipher", "").strip() or None,
                    "auth": row.get("Authentication", "").strip() or None,
                    "vendor": None,
                    "wps_enabled": False,
                    "wps_locked": False,
                })
        except Exception:
            pass

        return networks

    def parse_clients_csv(self, path: str, bssid: str | None = None) -> list[dict]:
        """Parse the STATION (client) section of an airodump-ng CSV file.

        Args:
            path:  Path to the CSV file written by airodump-ng.
            bssid: If given, only return clients associated with this BSSID.

        Returns:
            List of client dicts with keys: mac, bssid, power, packets, probes, last_seen.
        """
        clients: list[dict] = []
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                content = f.read()

            # Airodump-ng separates APs from STATIONs with a blank line.
            # The separator can be \r\n\r\n or \n\n depending on the OS / version.
            sep = "\r\n\r\n" if "\r\n\r\n" in content else "\n\n"
            sections = content.strip().split(sep)
            if len(sections) < 2:
                return clients

            station_section = sections[1]
            reader = csv.DictReader(station_section.splitlines())

            for row in reader:
                row = {k.strip(): v.strip() for k, v in row.items() if k}

                mac = row.get("Station MAC", "").strip()
                if not mac or mac.lower() == "station mac":
                    continue

                ap_bssid = row.get("BSSID", "").strip().upper()
                if bssid and ap_bssid != bssid.upper():
                    continue

                power_raw = row.get("Power", "").strip()
                try:
                    power = int(power_raw)
                except ValueError:
                    power = None

                packets_raw = (
                    row.get("# Packets", "") or row.get("Packets", "")
                ).strip()
                try:
                    packets = int(packets_raw)
                except ValueError:
                    packets = 0

                probes_raw = row.get("Probed ESSIDs", "").strip()
                probes = (
                    [p.strip() for p in probes_raw.split(",") if p.strip()]
                    if probes_raw else []
                )

                clients.append({
                    "mac":       mac.upper(),
                    "bssid":     ap_bssid,
                    "power":     power,
                    "packets":   packets,
                    "probes":    probes,
                    "last_seen": row.get("Last time seen", "").strip(),
                })
        except Exception:
            pass

        return clients
