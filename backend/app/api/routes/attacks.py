import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_session
from app.process.manager import process_manager
from app.schemas.attack import (
    AttackResponse,
    AttackStatus,
    CrackRequest,
    HandshakeAttackRequest,
    PmkidAttackRequest,
    WpsAttackRequest,
)
from app.services.attacker import attacker_service
from app.services.cracker import cracker_service

router = APIRouter(prefix="/api/attacks", tags=["attacks"])


@router.get("", response_model=list[AttackStatus])
async def list_attacks():
    """List all active and recent attack processes."""
    processes = process_manager.list_active()
    return [
        AttackStatus(
            id=p.attack_id,
            attack_type=p.attack_type,
            status=p.status,
            started_at=p.started_at,
            bssid=p.bssid,
        )
        for p in processes
    ]


@router.post("/{attack_id}/stop")
async def stop_attack(attack_id: str):
    """Terminate a running attack by ID."""
    killed = await process_manager.kill(attack_id)
    if not killed:
        raise HTTPException(status_code=404, detail=f"Attack '{attack_id}' not found or already stopped.")
    return {"message": f"Attack {attack_id} terminated."}


# ── WebSocket attack endpoints ────────────────────────────────────────────────

@router.websocket("/handshake")
async def handshake_attack(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_session),
):
    """WPA handshake capture with live terminal output.

    Client sends ``HandshakeAttackRequest`` JSON after receiving ``ready``.
    """
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "ready", "message": "Listo para captura de handshake"}))

    try:
        raw = await websocket.receive_text()
        req = HandshakeAttackRequest(**json.loads(raw))
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        await websocket.close()
        return

    try:
        async for event in attacker_service.capture_handshake(
            db=db,
            interface=req.interface,
            bssid=req.bssid,
            channel=req.channel,
            client_mac=req.client_mac,
            deauth_count=req.deauth_count,
            timeout=req.capture_timeout,
        ):
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@router.websocket("/wps")
async def wps_attack(websocket: WebSocket):
    """WPS Pixie Dust or brute-force attack with live terminal output."""
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "ready", "message": "Listo para ataque WPS"}))

    try:
        raw = await websocket.receive_text()
        req = WpsAttackRequest(**json.loads(raw))
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        await websocket.close()
        return

    try:
        async for event in attacker_service.attack_wps(
            interface=req.interface,
            bssid=req.bssid,
            channel=req.channel,
            mode=req.mode,
        ):
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@router.websocket("/pmkid")
async def pmkid_attack(websocket: WebSocket):
    """PMKID capture with live terminal output."""
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "ready", "message": "Listo para captura PMKID"}))

    try:
        raw = await websocket.receive_text()
        req = PmkidAttackRequest(**json.loads(raw))
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        await websocket.close()
        return

    try:
        async for event in attacker_service.capture_pmkid(
            interface=req.interface,
            bssid=req.bssid,
            timeout=req.timeout,
        ):
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@router.websocket("/crack")
async def crack_attack(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_session),
):
    """Offline cracking of a captured handshake/PMKID with live output."""
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "ready", "message": "Listo para cracking"}))

    try:
        raw = await websocket.receive_text()
        req = CrackRequest(**json.loads(raw))
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        await websocket.close()
        return

    try:
        async for event in cracker_service.crack(
            db=db,
            handshake_id=req.handshake_id,
            wordlist=req.wordlist,
            use_hashcat=req.use_hashcat,
            mask=req.mask,
        ):
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()
