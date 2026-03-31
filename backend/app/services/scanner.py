import asyncio
import os
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network
from app.tools.airodump import AirodumpTool

_airodump = AirodumpTool()


class ScannerService:
    """Orchestrates network scanning using airodump-ng."""

    async def upsert_network(self, db: AsyncSession, data: dict) -> Network:
        """Insert or update a network record from raw scan data.

        Args:
            db: Async SQLAlchemy session.
            data: Dict with keys matching Network fields.

        Returns:
            The persisted Network ORM object (refreshed from DB).
        """
        bssid = data.get("bssid", "").strip().upper()
        if not bssid:
            raise ValueError("bssid is required")

        result = await db.execute(select(Network).where(Network.bssid == bssid))
        network = result.scalar_one_or_none()

        if network is None:
            network = Network(bssid=bssid)
            db.add(network)

        network.ssid = data.get("ssid") or network.ssid
        network.channel = data.get("channel") or network.channel
        network.frequency = data.get("frequency") or network.frequency
        network.power = data.get("power") if data.get("power") is not None else network.power
        network.encryption = data.get("encryption") or network.encryption
        network.cipher = data.get("cipher") or network.cipher
        network.auth = data.get("auth") or network.auth
        network.wps_enabled = data.get("wps_enabled", network.wps_enabled)
        network.wps_locked = data.get("wps_locked", network.wps_locked)
        network.vendor = data.get("vendor") or network.vendor
        network.last_seen = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(network)
        return network

    async def start_scan(
        self,
        db: AsyncSession,
        interface: str,
        duration: int = 60,
    ) -> list[Network]:
        """Run a full scan and persist discovered networks.

        Args:
            db: Async SQLAlchemy session.
            interface: Monitor-mode interface (e.g. ``wlan0mon``).
            duration: Scan duration in seconds.

        Returns:
            List of Network ORM objects that were created or updated.
        """
        raw_networks = await _airodump.scan_all(interface, duration)
        saved: list[Network] = []

        for data in raw_networks:
            if not data.get("bssid"):
                continue
            try:
                network = await self.upsert_network(db, data)
                saved.append(network)
            except Exception:
                continue

        return saved

    async def scan_stream(
        self,
        interface: str,
        duration: int = 60,
    ) -> AsyncIterator[dict]:
        """Scan and yield parsed network dicts in real time (every 5 s).

        This variant yields raw dicts — the caller is responsible for DB
        persistence via ``upsert_network``.

        Yields:
            Network data dicts as they are parsed from airodump-ng's CSV output.
        """
        import tempfile

        work_dir = tempfile.mkdtemp(prefix="wifi_suite_scan_")
        prefix = os.path.join(work_dir, "scan")

        try:
            proc = await asyncio.create_subprocess_exec(
                "airodump-ng",
                "--output-format", "csv",
                "-w", prefix,
                interface,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            raise RuntimeError(
                "airodump-ng no está instalado. "
                "Ejecuta: sudo apt install aircrack-ng"
            )

        seen_bssids: set[str] = set()
        csv_path = f"{prefix}-01.csv"

        try:
            elapsed = 0
            while elapsed < duration:
                await asyncio.sleep(5)
                elapsed += 5

                # Detect early exit (bad interface, no permissions, etc.)
                if proc.returncode is not None and proc.returncode != 0:
                    stderr_bytes = b""
                    if proc.stderr:
                        try:
                            stderr_bytes = await asyncio.wait_for(
                                proc.stderr.read(), timeout=1
                            )
                        except asyncio.TimeoutError:
                            pass
                    msg = stderr_bytes.decode(errors="replace").strip()
                    raise RuntimeError(
                        f"airodump-ng salió con código {proc.returncode}"
                        + (f": {msg}" if msg else
                           ". Comprueba que la interfaz esté en modo monitor "
                           "y que el proceso corra como root.")
                    )

                if not os.path.exists(csv_path):
                    continue

                for net in _airodump.parse_csv(csv_path):
                    bssid = (net.get("bssid") or "").upper()
                    if bssid and bssid not in seen_bssids:
                        seen_bssids.add(bssid)
                        yield net
        finally:
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=3)
            except (ProcessLookupError, asyncio.TimeoutError):
                pass

    async def get_networks(self, db: AsyncSession) -> list[Network]:
        """Retrieve all networks, newest first."""
        result = await db.execute(select(Network).order_by(Network.last_seen.desc()))
        return list(result.scalars().all())

    async def get_network_by_id(self, db: AsyncSession, network_id: int) -> Network | None:
        """Retrieve a single network by primary key."""
        result = await db.execute(select(Network).where(Network.id == network_id))
        return result.scalar_one_or_none()

    async def delete_network(self, db: AsyncSession, network_id: int) -> bool:
        """Delete a network and cascade to handshakes/credentials."""
        network = await self.get_network_by_id(db, network_id)
        if network is None:
            return False
        await db.delete(network)
        await db.commit()
        return True


scanner_service = ScannerService()
