import json

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_session
from app.schemas.campaign import CampaignCreate, CampaignResponse
from app.services.campaign import campaign_service

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.get("", response_model=list[CampaignResponse])
async def list_campaigns(db: AsyncSession = Depends(get_session)):
    """Return all campaigns, newest first."""
    return await campaign_service.list_all(db)


@router.post("", response_model=CampaignResponse, status_code=201)
async def create_campaign(data: CampaignCreate, db: AsyncSession = Depends(get_session)):
    """Create a new multi-target campaign."""
    return await campaign_service.create(db, data)


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(campaign_id: int, db: AsyncSession = Depends(get_session)):
    """Return a single campaign with all targets."""
    campaign = await campaign_service.get_by_id(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return campaign


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(campaign_id: int, db: AsyncSession = Depends(get_session)):
    """Delete a campaign and its targets."""
    deleted = await campaign_service.delete(db, campaign_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Campaign not found.")


@router.post("/{campaign_id}/stop")
async def stop_campaign(campaign_id: int, db: AsyncSession = Depends(get_session)):
    """Mark a running campaign as paused (does not kill active subprocesses)."""
    campaign = await campaign_service.update_status(db, campaign_id, "paused")
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return {"message": f"Campaign #{campaign_id} paused.", "status": campaign.status}


@router.get("/{campaign_id}/stats")
async def get_stats(campaign_id: int, db: AsyncSession = Depends(get_session)):
    """Return aggregate statistics for a campaign."""
    stats = await campaign_service.get_stats(db, campaign_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return stats


@router.websocket("/{campaign_id}/stream")
async def run_campaign_stream(
    campaign_id: int,
    websocket: WebSocket,
    db: AsyncSession = Depends(get_session),
):
    """WebSocket: execute a campaign and stream progress events in real time.

    Protocol:
        1. Server → ``{ type: "ready" }``
        2. Client → any JSON (used as start signal)
        3. Server → WSEvents until done
    """
    await websocket.accept()
    await websocket.send_text(json.dumps({
        "type": "ready",
        "message": f"Campaña #{campaign_id} lista para iniciar. Envía cualquier mensaje para comenzar.",
    }))

    try:
        await websocket.receive_text()  # wait for client start signal
    except WebSocketDisconnect:
        await websocket.close()
        return

    try:
        async for event in campaign_service.run_campaign(db, campaign_id):
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        await campaign_service.update_status(db, campaign_id, "paused")
    except Exception as exc:
        await campaign_service.update_status(db, campaign_id, "failed")
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
    finally:
        await websocket.close()
