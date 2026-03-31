from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_session
from app.services.reporter import reporter_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{campaign_id}/json")
async def export_json(campaign_id: int, db: AsyncSession = Depends(get_session)):
    """Export a full campaign report as JSON."""
    data = await reporter_service.export_json(db, campaign_id)
    if not data or data == "{}":
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return Response(
        content=data,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="report_{campaign_id}.json"'},
    )


@router.get("/{campaign_id}/csv")
async def export_csv(campaign_id: int, db: AsyncSession = Depends(get_session)):
    """Export credentials found during a campaign as CSV."""
    data = await reporter_service.export_csv(db, campaign_id)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="credentials_{campaign_id}.csv"'},
    )


@router.get("/{campaign_id}/pdf")
async def export_pdf(campaign_id: int, db: AsyncSession = Depends(get_session)):
    """Export a full PDF report for a campaign."""
    pdf_bytes = await reporter_service.export_pdf(db, campaign_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="report_{campaign_id}.pdf"'},
    )
