from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_session
from app.models.credential import Credential
from app.models.handshake import Handshake
from app.models.network import Network

router = APIRouter(prefix="/api/credentials", tags=["credentials"])

_WORDLIST_EXTS = {".txt", ".lst", ".wordlist", ".dict"}


@router.get("/wordlists")
async def list_wordlists() -> list[dict]:
    """Scan wordlists_dir (and work_dir) for dictionary files.
    Returns [{name, path, size_mb}] sorted by name.
    """
    found: list[dict] = []

    def _scan(root: Path) -> None:
        if not root.exists():
            return
        for p in sorted(root.rglob("*")):
            if p.is_file() and p.suffix.lower() in _WORDLIST_EXTS:
                try:
                    size_mb = round(p.stat().st_size / 1_048_576, 1)
                except OSError:
                    size_mb = 0.0
                found.append({"name": p.name, "path": str(p), "size_mb": size_mb})

    _scan(Path(settings.wordlists_dir))
    # also surface any wordlists dropped into the captures dir
    _scan(Path(settings.work_dir))

    # deduplicate by path
    seen: set[str] = set()
    unique: list[dict] = []
    for item in found:
        if item["path"] not in seen:
            seen.add(item["path"])
            unique.append(item)

    return unique


class CredentialResponse(BaseModel):
    id: int
    network_id: int
    bssid: str
    ssid: str | None
    wps_pin: str | None
    attack_type: str
    cracked_by: str
    found_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HandshakeResponse(BaseModel):
    id: int
    network_id: int
    bssid: str
    ssid: str | None
    file_path: str
    file_type: str
    verified: bool
    captured_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/handshakes", response_model=list[HandshakeResponse])
async def list_handshakes(db: AsyncSession = Depends(get_session)):
    """Return all captured handshake/hash files joined with network info, newest first."""
    result = await db.execute(
        select(Handshake, Network)
        .join(Network, Handshake.network_id == Network.id)
        .order_by(Handshake.captured_at.desc())
    )
    rows = result.all()
    return [
        HandshakeResponse(
            id=hs.id,
            network_id=hs.network_id,
            bssid=net.bssid,
            ssid=net.ssid,
            file_path=hs.file_path,
            file_type=hs.file_type,
            verified=hs.verified,
            captured_at=hs.captured_at,
        )
        for hs, net in rows
    ]


@router.delete("/handshakes/{handshake_id}", status_code=204)
async def delete_handshake(handshake_id: int, db: AsyncSession = Depends(get_session)):
    """Remove a handshake record."""
    result = await db.execute(select(Handshake).where(Handshake.id == handshake_id))
    hs = result.scalar_one_or_none()
    if hs is None:
        raise HTTPException(status_code=404, detail="Handshake not found.")
    await db.delete(hs)
    await db.commit()


@router.get("/handshakes/{handshake_id}/content", response_class=PlainTextResponse)
async def get_handshake_content(
    handshake_id: int, db: AsyncSession = Depends(get_session)
):
    """Return the raw content of a captured hash file as plain text.
    hc22000 files → plain text lines.
    cap/pcapng files → annotated hex dump (first 512 bytes).
    """
    result = await db.execute(select(Handshake).where(Handshake.id == handshake_id))
    hs = result.scalar_one_or_none()
    if hs is None:
        raise HTTPException(status_code=404, detail="Handshake not found.")

    p = Path(hs.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found on disk: {hs.file_path}")

    if hs.file_type == "hc22000":
        # Human-readable hashcat 22000 format
        return p.read_text(errors="replace")

    # Binary capture — return a hex dump (first 512 bytes) with offsets
    raw = p.read_bytes()[:512]
    lines: list[str] = [
        f"# {p.name}  [{hs.file_type.upper()}]  {p.stat().st_size} bytes",
        f"# Showing first {len(raw)} bytes",
        "",
    ]
    for offset in range(0, len(raw), 16):
        chunk = raw[offset:offset + 16]
        hex_part  = " ".join(f"{b:02x}" for b in chunk).ljust(47)
        ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        lines.append(f"{offset:08x}  {hex_part}  |{ascii_part}|")
    return "\n".join(lines)


@router.get("", response_model=list[CredentialResponse])
async def list_credentials(db: AsyncSession = Depends(get_session)):
    """Return all found credentials joined with network info, newest first."""
    result = await db.execute(
        select(Credential, Network)
        .join(Network, Credential.network_id == Network.id)
        .order_by(Credential.found_at.desc())
    )
    rows = result.all()
    output = []
    for cred, net in rows:
        output.append(CredentialResponse(
            id=cred.id,
            network_id=cred.network_id,
            bssid=net.bssid,
            ssid=net.ssid,
            wps_pin=cred.wps_pin,
            attack_type=cred.attack_type,
            cracked_by=cred.cracked_by,
            found_at=cred.found_at,
        ))
    return output


@router.get("/{network_id}", response_model=list[CredentialResponse])
async def get_credentials_for_network(
    network_id: int, db: AsyncSession = Depends(get_session)
):
    """Return all credentials found for a specific network."""
    net_result = await db.execute(select(Network).where(Network.id == network_id))
    net = net_result.scalar_one_or_none()
    if net is None:
        raise HTTPException(status_code=404, detail="Network not found.")

    creds_result = await db.execute(
        select(Credential)
        .where(Credential.network_id == network_id)
        .order_by(Credential.found_at.desc())
    )
    creds = list(creds_result.scalars().all())
    return [
        CredentialResponse(
            id=c.id,
            network_id=c.network_id,
            bssid=net.bssid,
            ssid=net.ssid,
            wps_pin=c.wps_pin,
            attack_type=c.attack_type,
            cracked_by=c.cracked_by,
            found_at=c.found_at,
        )
        for c in creds
    ]


@router.delete("/{credential_id}", status_code=204)
async def delete_credential(credential_id: int, db: AsyncSession = Depends(get_session)):
    """Remove a credential record."""
    result = await db.execute(select(Credential).where(Credential.id == credential_id))
    cred = result.scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=404, detail="Credential not found.")
    await db.delete(cred)
    await db.commit()
