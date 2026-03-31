import os
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.credential import Credential
from app.models.handshake import Handshake
from app.tools.aircrack import AircrackTool
from app.tools.hashcat import HashcatTool
from app.tools.hcxtools import HcxTool

_aircrack = AircrackTool()
_hashcat = HashcatTool()
_hcxtools = HcxTool()


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
            wordlist: Override wordlist path; defaults to settings.wordlist_path.
            use_hashcat: If True, use hashcat instead of aircrack-ng.
            mask: Optional mask string for hashcat mask attack (replaces wordlist).
        """
        result = await db.execute(select(Handshake).where(Handshake.id == handshake_id))
        handshake = result.scalar_one_or_none()

        if handshake is None:
            yield {"type": "error", "message": f"Handshake #{handshake_id} no encontrado."}
            return

        wl = wordlist or settings.wordlist_path
        cap_file = handshake.file_path

        if not os.path.exists(cap_file):
            yield {"type": "error", "message": f"Archivo no encontrado: {cap_file}"}
            return

        yield {"type": "start", "message": f"Iniciando cracking del archivo {os.path.basename(cap_file)}"}

        # ── hashcat path ──────────────────────────────────────────────────────
        if use_hashcat:
            # Convert .cap → .hc22000 if necessary
            hash_file = cap_file
            if cap_file.endswith(".cap"):
                hash_file = cap_file.replace(".cap", ".hc22000")
                yield {"type": "step", "message": "Convirtiendo .cap a formato Hashcat..."}
                rc, output = await _hcxtools.convert_to_hashcat(cap_file, hash_file)
                if rc != 0:
                    yield {"type": "error", "message": f"Conversión fallida: {output}"}
                    return
                yield {"type": "output", "message": output, "tool": "hcxpcapngtool"}

            if mask:
                lines = _hashcat.crack_mask(hash_file, mask)
            else:
                lines = _hashcat.crack_wpa(hash_file, wl)

            full_output: list[str] = []
            async for line in lines:
                full_output.append(line)
                yield {"type": "output", "message": line, "tool": "hashcat"}

            password = _hashcat.parse_cracked("\n".join(full_output))
            cracker_name = "hashcat"

        # ── aircrack-ng path ──────────────────────────────────────────────────
        else:
            full_output = []
            async for line in _aircrack.crack(cap_file, wl):
                full_output.append(line)
                yield {"type": "output", "message": line, "tool": "aircrack-ng"}

            password = _aircrack.parse_key_found("\n".join(full_output))
            cracker_name = "aircrack-ng"

        # ── result ────────────────────────────────────────────────────────────
        if password:
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
                "message": f"Contraseña encontrada por {cracker_name}",
                "data": {"password": password, "cracker": cracker_name},
            }
            yield {"type": "done", "message": "Cracking completado."}
        else:
            yield {"type": "error", "message": "Contraseña no encontrada en el diccionario."}


cracker_service = CrackerService()
