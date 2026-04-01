import logging
import os
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.credential import Credential
from app.models.handshake import Handshake
from app.models.network import Network
from app.tools.aircrack import AircrackTool
from app.tools.hashcat import HashcatTool
from app.tools.hcxtools import HcxTool

logger = logging.getLogger(__name__)

_aircrack = AircrackTool()
_hashcat = HashcatTool()
_hcxtools = HcxTool()

# Common wordlist locations to search
ROCKYOU_PATHS = [
    "/usr/share/wordlists/rockyou.txt",
    "/usr/share/wordlists/rockyou.txt.gz",
    "/usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt",
    "/opt/wordlists/rockyou.txt",
]


def _find_rockyou() -> str | None:
    """Find rockyou.txt in common locations."""
    for path in ROCKYOU_PATHS:
        if os.path.exists(path):
            return path
    return None


def _count_lines_estimate(filepath: str) -> int:
    """Estimate line count for progress calculation."""
    try:
        size = os.path.getsize(filepath)
        # Average line length in rockyou is ~10 bytes
        return max(1, size // 10)
    except OSError:
        return 14344392  # rockyou.txt default


class CrackerService:
    """Orchestrates offline password cracking (aircrack-ng and hashcat)."""

    async def crack(
        self,
        db: AsyncSession,
        handshake_id: int,
        wordlist: str | None = None,
        use_hashcat: bool = False,
        mask: str | None = None,
    ) -> AsyncIterator[dict]:
        """Crack a captured handshake and yield WSEvent dicts.

        Automatically saves found credentials to the database.

        Args:
            db: Async DB session.
            handshake_id: Primary key of the Handshake record.
            wordlist: Override wordlist path; defaults to rockyou.txt.
            use_hashcat: If True, use hashcat instead of aircrack-ng.
            mask: Optional mask string for hashcat mask attack (replaces wordlist).
        """
        # ── Load handshake with network ───────────────────────────────────────
        result = await db.execute(
            select(Handshake, Network)
            .join(Network, Handshake.network_id == Network.id)
            .where(Handshake.id == handshake_id)
        )
        row = result.first()

        if row is None:
            yield {"type": "error", "message": f"Handshake #{handshake_id} no encontrado."}
            return

        handshake, network = row
        bssid = network.bssid if network else None
        ssid = network.ssid if network else None

        cap_file = handshake.file_path
        if not os.path.exists(cap_file):
            yield {"type": "error", "message": f"Archivo de captura no encontrado: {cap_file}"}
            return

        yield {"type": "step", "message": f"Red objetivo: {ssid or bssid or 'Desconocida'}"}

        # ── Resolve wordlist ──────────────────────────────────────────────────
        wl = wordlist
        if not wl:
            # Try configured path first
            if settings.wordlist_path and os.path.exists(settings.wordlist_path):
                wl = settings.wordlist_path
            else:
                # Fall back to finding rockyou.txt
                wl = _find_rockyou()

        if not wl and not mask:
            yield {"type": "error", "message": "No se encontró rockyou.txt. Instala con: sudo apt install wordlists && sudo gunzip /usr/share/wordlists/rockyou.txt.gz"}
            return

        if wl and not os.path.exists(wl):
            yield {"type": "error", "message": f"Diccionario no encontrado: {wl}"}
            return

        # Check wordlist size
        if wl:
            try:
                wl_size = os.path.getsize(wl)
                if wl_size == 0:
                    yield {"type": "error", "message": f"El diccionario {os.path.basename(wl)} está vacío."}
                    return
                elif wl_size < 1000:
                    yield {"type": "warning", "message": f"El diccionario es muy pequeño ({wl_size} bytes). Usa rockyou.txt para mejores resultados."}
            except OSError:
                pass

        # Verify tool availability
        cracker_name = "hashcat" if use_hashcat else "aircrack-ng"
        tool = _hashcat if use_hashcat else _aircrack
        if not tool.is_available():
            yield {"type": "error", "message": f"{cracker_name} no está instalado."}
            return

        # ── Verify handshake before cracking ────────────────────────────────
        if not use_hashcat and cap_file.endswith(".cap"):
            yield {"type": "step", "message": "Verificando handshake en archivo .cap..."}
            has_hs, hs_bssid = await _aircrack.verify_handshake(cap_file, bssid)
            if not has_hs:
                yield {"type": "error", "message": "No se encontró un handshake válido en el archivo .cap. Captura de nuevo."}
                return
            yield {"type": "step", "message": f"Handshake verificado para {hs_bssid or bssid or 'BSSID desconocido'}"}

        # ── Start cracking ────────────────────────────────────────────────────
        wordlist_name = os.path.basename(wl) if wl else "mask"
        yield {
            "type": "start",
            "message": f"Iniciando cracking con {cracker_name}",
            "data": {"file": os.path.basename(cap_file), "wordlist": wordlist_name},
        }

        yield {"type": "step", "message": f"Diccionario: {wordlist_name}"}

        password = None
        line_count = 0
        estimated_total = _count_lines_estimate(wl) if wl else 1000000

        # ── hashcat path ──────────────────────────────────────────────────────
        if use_hashcat:
            # Convert .cap → .hc22000 if necessary
            hash_file = cap_file
            if cap_file.endswith(".cap") or cap_file.endswith(".pcapng"):
                ext = ".cap" if cap_file.endswith(".cap") else ".pcapng"
                hash_file = cap_file.replace(ext, ".hc22000")
                yield {"type": "step", "message": "Convirtiendo captura a formato Hashcat (hc22000)..."}
                rc, output = await _hcxtools.convert_to_hashcat(cap_file, hash_file)
                if rc != 0:
                    yield {"type": "error", "message": f"Conversión fallida: {output}"}
                    return
                if output.strip():
                    yield {"type": "output", "message": output.strip(), "tool": "hcxpcapngtool"}

            if mask:
                yield {"type": "step", "message": f"Usando máscara: {mask}"}
                lines = _hashcat.crack_mask(hash_file, mask)
            else:
                lines = _hashcat.crack_wpa(hash_file, wl)

            full_output: list[str] = []
            async for line in lines:
                full_output.append(line)
                line_count += 1

                # Parse progress
                progress = _hashcat.parse_progress(line)
                if progress and progress.progress_percent > 0:
                    yield {
                        "type": "progress",
                        "message": f"Progreso: {progress.progress_percent:.1f}%",
                        "progress": int(progress.progress_percent),
                    }

                # Check for cracked password
                if _hashcat.is_cracked(line):
                    yield {"type": "output", "message": f"🔑 {line}", "tool": "hashcat"}
                elif line.strip():
                    yield {"type": "output", "message": line, "tool": "hashcat"}

            password = _hashcat.parse_cracked("\n".join(full_output))

        # ── aircrack-ng path ──────────────────────────────────────────────────
        else:
            full_output: list[str] = []
            last_progress = 0

            cmd_info = f"aircrack-ng -w {os.path.basename(wl)}"
            if bssid:
                cmd_info += f" -b {bssid}"
            cmd_info += f" {os.path.basename(cap_file)}"
            yield {"type": "step", "message": f"Ejecutando: {cmd_info}"}

            async for line in _aircrack.crack(cap_file, wl, bssid=bssid):
                full_output.append(line)
                line_count += 1

                # Show all non-empty lines from aircrack-ng
                if line.strip():
                    # Parse progress if present
                    progress = _aircrack.parse_progress(line)
                    if progress and progress.keys_tested > 0:
                        pct = min(99, int((progress.keys_tested / estimated_total) * 100))
                        if pct > last_progress:
                            last_progress = pct
                            speed_info = f" ({progress.keys_per_second:.0f} k/s)" if progress.keys_per_second else ""
                            yield {
                                "type": "progress",
                                "message": f"Probadas {progress.keys_tested:,} claves{speed_info}",
                                "progress": pct,
                            }

                    # Check for key found
                    if _aircrack.is_key_found(line):
                        yield {"type": "output", "message": f"🔑 {line}", "tool": "aircrack-ng"}
                    else:
                        # Show all output lines for visibility
                        yield {"type": "output", "message": line, "tool": "aircrack-ng"}

            password = _aircrack.parse_key_found("\n".join(full_output))

            # If no output was received, show a message
            if line_count == 0:
                yield {"type": "warning", "message": "aircrack-ng no produjo salida. Verifica el archivo .cap y el diccionario."}

        # ── Save result ───────────────────────────────────────────────────────
        if password:
            logger.info(f"Password found for handshake #{handshake_id}: {password[:3]}***")
            credential = Credential(
                network_id=handshake.network_id,
                password=password,
                attack_type="wpa_handshake",
                cracked_by=cracker_name,
                found_at=datetime.now(timezone.utc),
            )
            db.add(credential)
            await db.commit()

            yield {
                "type": "credential",
                "message": f"¡Contraseña encontrada!",
                "data": {"password": password, "cracker": cracker_name},
            }
            yield {"type": "done", "message": f"Cracking completado. Contraseña: {password}"}
        else:
            yield {
                "type": "error",
                "message": f"Contraseña no encontrada en {wordlist_name}. Prueba con otro diccionario.",
            }


cracker_service = CrackerService()
