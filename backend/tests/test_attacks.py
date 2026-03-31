import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_attacks_empty(client: AsyncClient):
    r = await client.get("/api/attacks")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_stop_nonexistent(client: AsyncClient):
    r = await client.post("/api/attacks/does-not-exist/stop")
    assert r.status_code == 404
