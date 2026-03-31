import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network


async def _seed_network(db: AsyncSession, bssid: str) -> int:
    net = Network(bssid=bssid, ssid="TestNet", channel=6, encryption="WPA2")
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net.id


@pytest.mark.asyncio
async def test_list_empty(client: AsyncClient):
    r = await client.get("/api/campaigns")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_campaign(client: AsyncClient, db_session: AsyncSession):
    net_id = await _seed_network(db_session, "CA:MP:00:00:00:01")
    payload = {
        "name": "Test Campaign",
        "description": "Unit test",
        "interface": "wlan0mon",
        "targets": [{"network_id": net_id, "attack_types": ["wpa_handshake"]}],
    }
    r = await client.post("/api/campaigns", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Test Campaign"
    assert body["status"] == "pending"
    assert len(body["targets"]) == 1


@pytest.mark.asyncio
async def test_get_campaign(client: AsyncClient, db_session: AsyncSession):
    net_id = await _seed_network(db_session, "CA:MP:00:00:00:02")
    r = await client.post("/api/campaigns", json={
        "name": "Get Test", "interface": "wlan0mon",
        "targets": [{"network_id": net_id, "attack_types": ["pmkid"]}],
    })
    campaign_id = r.json()["id"]

    r2 = await client.get(f"/api/campaigns/{campaign_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == campaign_id


@pytest.mark.asyncio
async def test_get_campaign_not_found(client: AsyncClient):
    r = await client.get("/api/campaigns/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_campaign(client: AsyncClient, db_session: AsyncSession):
    net_id = await _seed_network(db_session, "CA:MP:00:00:00:03")
    r = await client.post("/api/campaigns", json={
        "name": "Delete Me", "interface": "wlan0mon",
        "targets": [{"network_id": net_id, "attack_types": ["pmkid"]}],
    })
    cid = r.json()["id"]

    r2 = await client.delete(f"/api/campaigns/{cid}")
    assert r2.status_code == 204

    r3 = await client.get(f"/api/campaigns/{cid}")
    assert r3.status_code == 404


@pytest.mark.asyncio
async def test_campaign_stats(client: AsyncClient, db_session: AsyncSession):
    net_id = await _seed_network(db_session, "CA:MP:00:00:00:04")
    r = await client.post("/api/campaigns", json={
        "name": "Stats Test", "interface": "wlan0mon",
        "targets": [{"network_id": net_id, "attack_types": ["wpa_handshake"]}],
    })
    cid = r.json()["id"]

    r2 = await client.get(f"/api/campaigns/{cid}/stats")
    assert r2.status_code == 200
    stats = r2.json()
    assert stats["campaign_id"] == cid
    assert "total_targets" in stats
    assert "credentials_found" in stats
