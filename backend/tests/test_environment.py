import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_summary_shape(client: AsyncClient):
    r = await client.get("/api/environment/summary")
    assert r.status_code == 200
    body = r.json()
    for field in ("ready", "essential_total", "essential_installed",
                  "optional_total", "optional_installed",
                  "system_total", "system_installed"):
        assert field in body, f"Missing field: {field}"
    assert isinstance(body["ready"], bool)


@pytest.mark.asyncio
async def test_check_all_count(client: AsyncClient):
    r = await client.get("/api/environment/check")
    assert r.status_code == 200
    tools = r.json()
    assert isinstance(tools, list)
    assert len(tools) == 17


@pytest.mark.asyncio
async def test_check_all_valid_statuses(client: AsyncClient):
    r = await client.get("/api/environment/check")
    valid = {"installed", "missing", "installing", "failed"}
    for tool in r.json():
        assert tool["status"] in valid
        assert tool["binary"]
        assert tool["category"] in {"essential", "optional", "system"}


@pytest.mark.asyncio
async def test_check_one_known(client: AsyncClient):
    r = await client.get("/api/environment/check/aircrack-ng")
    assert r.status_code == 200
    assert r.json()["binary"] == "aircrack-ng"


@pytest.mark.asyncio
async def test_check_one_unknown(client: AsyncClient):
    r = await client.get("/api/environment/check/tool-that-does-not-exist")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_filter_essential(client: AsyncClient):
    r = await client.get("/api/environment/filter?category=essential")
    assert r.status_code == 200
    tools = r.json()
    assert len(tools) == 6
    assert all(t["category"] == "essential" for t in tools)


@pytest.mark.asyncio
async def test_filter_optional(client: AsyncClient):
    r = await client.get("/api/environment/filter?category=optional")
    assert r.status_code == 200
    assert all(t["category"] == "optional" for t in r.json())


@pytest.mark.asyncio
async def test_filter_system(client: AsyncClient):
    r = await client.get("/api/environment/filter?category=system")
    assert r.status_code == 200
    assert all(t["category"] == "system" for t in r.json())


@pytest.mark.asyncio
async def test_filter_combined(client: AsyncClient):
    r = await client.get("/api/environment/filter?category=essential&status=missing")
    assert r.status_code == 200
    for t in r.json():
        assert t["category"] == "essential"
        assert t["status"] == "missing"
