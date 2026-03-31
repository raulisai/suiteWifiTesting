import json

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.schemas.environment import EnvironmentSummary, ToolCheckResponse, ToolInstallRequest, WifiInterface
from app.services.environment import environment_service

router = APIRouter(prefix="/api/environment", tags=["environment"])


@router.get("/summary", response_model=EnvironmentSummary)
async def get_summary():
    """Quick summary: ready flag + installed counts per category."""
    return await environment_service.get_summary()


@router.get("/interfaces", response_model=list[WifiInterface])
async def list_interfaces():
    """Return all wireless interfaces detected by ``iw dev``.

    Each object includes: name, phy, ifindex, addr, type (managed/monitor/AP),
    channel, frequency (MHz), ssid and txpower.
    """
    raw = await environment_service.list_interfaces()
    return [WifiInterface(**iface) for iface in raw]


@router.get("/check", response_model=list[ToolCheckResponse])
async def check_all():
    """Full status of all 17 tools with version strings."""
    tools = await environment_service.check_all()
    return [
        ToolCheckResponse(
            name=t.name,
            binary=t.binary,
            category=t.category.value,
            apt_package=t.apt_package,
            description=t.description,
            status=t.status.value,
            version=t.version,
        )
        for t in tools
    ]


@router.get("/check/{binary}", response_model=ToolCheckResponse)
async def check_one(binary: str):
    """Check a single tool by binary name."""
    tool = await environment_service.check_one(binary)
    if tool is None:
        raise HTTPException(status_code=404, detail=f"Binary '{binary}' not in catalog.")
    return ToolCheckResponse(
        name=tool.name,
        binary=tool.binary,
        category=tool.category.value,
        apt_package=tool.apt_package,
        description=tool.description,
        status=tool.status.value,
        version=tool.version,
    )


@router.get("/filter", response_model=list[ToolCheckResponse])
async def filter_tools(category: str | None = None, status: str | None = None):
    """Filter tools by category and/or status.

    Query params:
        category: ``essential`` | ``optional`` | ``system``
        status:   ``installed`` | ``missing``
    """
    tools = await environment_service.check_all()

    if category:
        tools = [t for t in tools if t.category.value == category]
    if status:
        tools = [t for t in tools if t.status.value == status]

    return [
        ToolCheckResponse(
            name=t.name,
            binary=t.binary,
            category=t.category.value,
            apt_package=t.apt_package,
            description=t.description,
            status=t.status.value,
            version=t.version,
        )
        for t in tools
    ]


@router.post("/install")
async def install_tools(request: ToolInstallRequest):
    """Install missing tools via apt-get (no streaming)."""
    lines: list[str] = []
    async for line in environment_service.install_stream(
        binaries=request.binaries,
        only_missing=request.only_missing,
    ):
        lines.append(line)
    return {"output": "\n".join(lines)}


@router.post("/install/{binary}")
async def install_one(binary: str):
    """Install a single tool by binary name."""
    success, output = await environment_service.install_one(binary)
    return {"success": success, "output": output}


@router.websocket("/install/stream")
async def install_stream(websocket: WebSocket):
    """WebSocket endpoint for streaming tool installation.

    Protocol:
        1. Server sends ``{ type: "ready" }``
        2. Client sends ``ToolInstallRequest`` JSON
        3. Server streams install output as ``{ type: "output", message: "..." }``
        4. Server closes connection on completion
    """
    await websocket.accept()

    await websocket.send_text(json.dumps({"type": "ready", "message": "Listo para instalar"}))

    try:
        raw = await websocket.receive_text()
        config = ToolInstallRequest(**json.loads(raw))
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        await websocket.close()
        return

    try:
        async for line in environment_service.install_stream(
            binaries=config.binaries,
            only_missing=config.only_missing,
        ):
            await websocket.send_text(json.dumps({"type": "output", "message": line}))

        await websocket.send_text(json.dumps({"type": "done", "message": "Instalación finalizada."}))
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()
