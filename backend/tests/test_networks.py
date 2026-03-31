import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network


@pytest.mark.asyncio
async def test_list_empty(client: AsyncClient):
    r = await client.get("/api/networks")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_get_not_found(client: AsyncClient):
    r = await client.get("/api/networks/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_not_found(client: AsyncClient):
    r = await client.delete("/api/networks/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_and_list(client: AsyncClient, db_session: AsyncSession):
    """Manually insert a network and verify it appears via the API."""
    net = Network(
        bssid="AA:BB:CC:DD:EE:FF",
        ssid="TestNet",
        channel=6,
        frequency="2.4GHz",
        power=-55,
        encryption="WPA2",
        cipher="CCMP",
        auth="PSK",
        wps_enabled=False,
        wps_locked=False,
    )
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    r = await client.get("/api/networks")
    assert r.status_code == 200
    bssids = [n["bssid"] for n in r.json()]
    assert "AA:BB:CC:DD:EE:FF" in bssids


@pytest.mark.asyncio
async def test_get_by_id(client: AsyncClient, db_session: AsyncSession):
    net = Network(bssid="11:22:33:44:55:66", ssid="GetById", channel=11, encryption="WPA2")
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    r = await client.get(f"/api/networks/{net.id}")
    assert r.status_code == 200
    assert r.json()["bssid"] == "11:22:33:44:55:66"


@pytest.mark.asyncio
async def test_delete_network(client: AsyncClient, db_session: AsyncSession):
    net = Network(bssid="DE:AD:BE:EF:00:01", ssid="ToDelete", channel=1)
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    r = await client.delete(f"/api/networks/{net.id}")
    assert r.status_code == 204

    r2 = await client.get(f"/api/networks/{net.id}")
    assert r2.status_code == 404
