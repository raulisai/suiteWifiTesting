import json

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_session
from app.models.network import Network
from app.schemas.network import NetworkResponse, NetworkScanRequest
from app.services.scanner import scanner_service

router = APIRouter(prefix="/api/networks", tags=["networks"])


@router.get("", response_model=list[NetworkResponse])
async def list_networks(db: AsyncSession = Depends(get_session)):
    """Return all networks stored in the database, newest first."""
    return await scanner_service.get_networks(db)


@router.get("/{network_id}", response_model=NetworkResponse)
async def get_network(network_id: int, db: AsyncSession = Depends(get_session)):
    """Return a single network by ID."""
    network = await scanner_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(status_code=404, detail="Network not found.")
    return network


@router.delete("/{network_id}", status_code=204)
async def delete_network(network_id: int, db: AsyncSession = Depends(get_session)):
    """Remove a network record and its related handshakes/credentials."""
    deleted = await scanner_service.delete_network(db, network_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Network not found.")


@router.post("/scan", response_model=list[NetworkResponse])
async def scan_networks(
    request: NetworkScanRequest,
    db: AsyncSession = Depends(get_session),
):
    """Blocking network scan — waits for completion, returns found networks.

    For live output use the ``/scan/stream`` WebSocket endpoint instead.
    """
    return await scanner_service.start_scan(db, request.interface, request.duration)


@router.websocket("/scan/stream")
async def scan_stream(websocket: WebSocket, db: AsyncSession = Depends(get_session)):
    """WebSocket: stream newly discovered networks in real time.

    Protocol:
        1. Server → ``{ type: "ready" }``
        2. Client → ``NetworkScanRequest`` JSON
        3. Server → ``{ type: "network_found", data: {...} }`` per new network
        4. Server → ``{ type: "done" }`` on completion
    """
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "ready", "message": "Escáner listo"}))

    try:
        raw = await websocket.receive_text()
        config = NetworkScanRequest(**json.loads(raw))
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        await websocket.close()
        return

    try:
        async for net_data in scanner_service.scan_stream(config.interface, config.duration):
            # Persist to DB in real time
            saved = await scanner_service.upsert_network(db, net_data)
            await websocket.send_text(json.dumps({
                "type": "network_found",
                "message": f"Red detectada: {net_data.get('ssid') or net_data.get('bssid')}",
                "data": {
                    "id": saved.id,
                    "bssid": saved.bssid,
                    "ssid": saved.ssid,
                    "channel": saved.channel,
                    "power": saved.power,
                    "encryption": saved.encryption,
                    "wps_enabled": saved.wps_enabled,
                },
            }))

        await websocket.send_text(json.dumps({"type": "done", "message": "Escaneo completado."}))
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()
