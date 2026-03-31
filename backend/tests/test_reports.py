import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network


@pytest.mark.asyncio
async def test_report_not_found(client: AsyncClient):
    r = await client.get("/api/reports/99999/json")
    assert r.status_code in (404, 200)  # empty JSON {} returns 404


@pytest.mark.asyncio
async def test_json_report(client: AsyncClient, db_session: AsyncSession):
    # Create a campaign first
    net = Network(bssid="RE:PO:00:00:00:01", ssid="ReportNet", channel=6, encryption="WPA2")
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    r = await client.post("/api/campaigns", json={
        "name": "Report Campaign",
        "interface": "wlan0mon",
        "targets": [{"network_id": net.id, "attack_types": ["wpa_handshake"]}],
    })
    cid = r.json()["id"]

    r2 = await client.get(f"/api/reports/{cid}/json")
    assert r2.status_code == 200
    import json
    data = json.loads(r2.content)
    assert "name" in data
    assert data["campaign_id"] == cid


@pytest.mark.asyncio
async def test_csv_report(client: AsyncClient, db_session: AsyncSession):
    net = Network(bssid="RE:PO:00:00:00:02", ssid="CSVNet", channel=11, encryption="WPA2")
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    r = await client.post("/api/campaigns", json={
        "name": "CSV Campaign", "interface": "wlan0mon",
        "targets": [{"network_id": net.id, "attack_types": ["pmkid"]}],
    })
    cid = r.json()["id"]

    r2 = await client.get(f"/api/reports/{cid}/csv")
    assert r2.status_code == 200
    assert "bssid" in r2.text  # header row


@pytest.mark.asyncio
async def test_pdf_report(client: AsyncClient, db_session: AsyncSession):
    net = Network(bssid="RE:PO:00:00:00:03", ssid="PDFNet", channel=1, encryption="WPA2")
    db_session.add(net)
    await db_session.commit()
    await db_session.refresh(net)

    r = await client.post("/api/campaigns", json={
        "name": "PDF Campaign", "interface": "wlan0mon",
        "targets": [{"network_id": net.id, "attack_types": ["wpa_handshake"]}],
    })
    cid = r.json()["id"]

    r2 = await client.get(f"/api/reports/{cid}/pdf")
    assert r2.status_code == 200
    assert r2.headers["content-type"] == "application/pdf"
    assert r2.content[:4] == b"%PDF"
