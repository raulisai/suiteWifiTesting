from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_session
from app.models.credential import Credential
from app.models.network import Network

router = APIRouter(prefix="/api/credentials", tags=["credentials"])


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
