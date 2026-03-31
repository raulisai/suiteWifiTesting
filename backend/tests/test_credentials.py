import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credential import Credential
from app.models.network import Network


@pytest.mark.asyncio
async def test_list_credentials_empty(client: AsyncClient):
    r = await client.get("/api/credentials")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_credentials_for_network(client: AsyncClient, db_session: AsyncSession):
    net = Network(bssid="CR:ED:00:00:00:01", ssid="CredNet", channel=6, encryption="WPA2")
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    cred = Credential(
        network_id=net.id,
        password="mysecretpass",
        attack_type="wpa_handshake",
        cracked_by="aircrack-ng",
    )
    db_session.add(cred)
    await db_session.commit()

    r = await client.get(f"/api/credentials/{net.id}")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert items[0]["bssid"] == "CR:ED:00:00:00:01"
    assert items[0]["attack_type"] == "wpa_handshake"


@pytest.mark.asyncio
async def test_credentials_network_not_found(client: AsyncClient):
    r = await client.get("/api/credentials/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_credential(client: AsyncClient, db_session: AsyncSession):
    net = Network(bssid="CR:ED:00:00:00:02", ssid="DelNet", channel=6, encryption="WPA2")
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    cred = Credential(
        network_id=net.id,
        password="deleteme",
        attack_type="pmkid",
        cracked_by="hashcat",
    )
    db_session.add(cred)
    await db_session.commit()
    await db_session.refresh(cred)

    r = await client.delete(f"/api/credentials/{cred.id}")
    assert r.status_code == 204
