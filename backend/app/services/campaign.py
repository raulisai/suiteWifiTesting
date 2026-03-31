import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign, CampaignTarget
from app.models.credential import Credential
from app.models.handshake import Handshake
from app.models.network import Network
from app.schemas.campaign import CampaignCreate
from app.services.attacker import attacker_service
from app.services.cracker import cracker_service
from app.core.config import settings


class CampaignService:
    """CRUD and orchestration for multi-target audit campaigns."""

    # ── CRUD ──────────────────────────────────────────────────────────────────

    async def create(self, db: AsyncSession, data: CampaignCreate) -> Campaign:
        """Create a new campaign with its targets."""
        campaign = Campaign(
            name=data.name,
            description=data.description,
            status="pending",
            interface=data.interface,
            wordlist=data.wordlist,
            created_at=datetime.now(timezone.utc),
        )
        db.add(campaign)
        await db.flush()  # get campaign.id

        for t in data.targets:
            target = CampaignTarget(
                campaign_id=campaign.id,
                network_id=t.network_id,
                attack_types=t.attack_types,
                status="pending",
            )
            db.add(target)

        await db.commit()
        await db.refresh(campaign)
        return campaign

    async def list_all(self, db: AsyncSession) -> list[Campaign]:
        """Return all campaigns ordered by creation date (newest first)."""
        result = await db.execute(
            select(Campaign).order_by(Campaign.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, db: AsyncSession, campaign_id: int) -> Campaign | None:
        result = await db.execute(
            select(Campaign).where(Campaign.id == campaign_id)
        )
        return result.scalar_one_or_none()

    async def delete(self, db: AsyncSession, campaign_id: int) -> bool:
        campaign = await self.get_by_id(db, campaign_id)
        if campaign is None:
            return False
        await db.delete(campaign)
        await db.commit()
        return True

    async def update_status(
        self, db: AsyncSession, campaign_id: int, status: str
    ) -> Campaign | None:
        campaign = await self.get_by_id(db, campaign_id)
        if campaign is None:
            return None
        campaign.status = status
        if status == "running" and campaign.started_at is None:
            campaign.started_at = datetime.now(timezone.utc)
        if status in ("completed", "failed"):
            campaign.ended_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(campaign)
        return campaign

    # ── Orchestration ─────────────────────────────────────────────────────────

    async def run_campaign(
        self, db: AsyncSession, campaign_id: int
    ) -> AsyncIterator[dict]:
        """Execute all targets in a campaign sequentially, yielding WSEvents.

        Attack order per target:
            1. WPS Pixie Dust (if wps_enabled and not locked)
            2. PMKID capture (always, if hcxdumptool available)
            3. WPA Handshake + deauth
            4. Crack all captured handshakes with aircrack-ng / hashcat

        Yields standard WSEvent dicts throughout.
        """
        campaign = await self.get_by_id(db, campaign_id)
        if campaign is None:
            yield {"type": "error", "message": f"Campaña #{campaign_id} no encontrada."}
            return

        await self.update_status(db, campaign_id, "running")
        yield {"type": "start", "message": f"Iniciando campaña: {campaign.name}"}

        # Load targets with networks
        targets_result = await db.execute(
            select(CampaignTarget).where(CampaignTarget.campaign_id == campaign_id)
        )
        targets = list(targets_result.scalars().all())

        total = len(targets)
        for idx, target in enumerate(targets, 1):
            network_result = await db.execute(
                select(Network).where(Network.id == target.network_id)
            )
            network = network_result.scalar_one_or_none()
            if network is None:
                yield {"type": "warning", "message": f"Red #{target.network_id} no encontrada, saltando."}
                continue

            yield {
                "type": "step",
                "message": f"[{idx}/{total}] Atacando: {network.ssid or network.bssid}",
                "progress": int((idx - 1) / total * 100),
            }

            # Mark target as attacking
            target.status = "attacking"
            target.started_at = datetime.now(timezone.utc)
            await db.commit()

            attack_types: list[str] = target.attack_types or []

            # ── WPS ────────────────────────────────────────────────────────────
            if "wps_pixie" in attack_types and network.wps_enabled and not network.wps_locked:
                yield {"type": "step", "message": f"  WPS Pixie Dust → {network.bssid}"}
                async for event in attacker_service.attack_wps(
                    db, campaign.interface, network.bssid, network.channel or 6, "pixie"
                ):
                    yield event
                    if event["type"] == "credential":
                        break  # success — skip remaining attacks on this target

            # ── PMKID ──────────────────────────────────────────────────────────
            if "pmkid" in attack_types:
                yield {"type": "step", "message": f"  PMKID → {network.bssid}"}
                async for event in attacker_service.capture_pmkid(
                    campaign.interface, network.bssid, timeout=60
                ):
                    yield event

            # ── WPA Handshake ──────────────────────────────────────────────────
            if "wpa_handshake" in attack_types:
                yield {"type": "step", "message": f"  Handshake WPA → {network.bssid}"}
                async for event in attacker_service.capture_handshake(
                    db, campaign.interface, network.bssid,
                    network.channel or 6, timeout=120
                ):
                    yield event

            # ── Crack captured handshakes ──────────────────────────────────────
            if "crack" in attack_types or "wpa_handshake" in attack_types:
                target.status = "cracking"
                await db.commit()

                hs_result = await db.execute(
                    select(Handshake).where(Handshake.network_id == network.id)
                )
                handshakes = list(hs_result.scalars().all())
                for hs in handshakes:
                    yield {"type": "step", "message": f"  Crackeando handshake #{hs.id}..."}
                    async for event in cracker_service.crack(
                        db, hs.id, wordlist=campaign.wordlist
                    ):
                        yield event

            # ── Mark target done ───────────────────────────────────────────────
            target.status = "done"
            target.ended_at = datetime.now(timezone.utc)
            await db.commit()

            yield {
                "type": "progress",
                "message": f"Objetivo {idx}/{total} completado.",
                "progress": int(idx / total * 100),
            }

        await self.update_status(db, campaign_id, "completed")
        yield {"type": "done", "message": f"Campaña '{campaign.name}' finalizada."}

    async def get_stats(self, db: AsyncSession, campaign_id: int) -> dict:
        """Return aggregate stats for a campaign (for reports)."""
        campaign = await self.get_by_id(db, campaign_id)
        if not campaign:
            return {}

        targets_result = await db.execute(
            select(CampaignTarget).where(CampaignTarget.campaign_id == campaign_id)
        )
        targets = list(targets_result.scalars().all())
        network_ids = [t.network_id for t in targets]

        creds_result = await db.execute(
            select(Credential).where(Credential.network_id.in_(network_ids))
        )
        credentials = list(creds_result.scalars().all())

        hs_result = await db.execute(
            select(Handshake).where(Handshake.network_id.in_(network_ids))
        )
        handshakes = list(hs_result.scalars().all())

        return {
            "campaign_id": campaign_id,
            "name": campaign.name,
            "status": campaign.status,
            "started_at": campaign.started_at.isoformat() if campaign.started_at else None,
            "ended_at": campaign.ended_at.isoformat() if campaign.ended_at else None,
            "total_targets": len(targets),
            "done_targets": sum(1 for t in targets if t.status == "done"),
            "handshakes_captured": len(handshakes),
            "credentials_found": len(credentials),
            "credentials": [
                {
                    "network_id": c.network_id,
                    "attack_type": c.attack_type,
                    "cracked_by": c.cracked_by,
                    "found_at": c.found_at.isoformat(),
                }
                for c in credentials
            ],
        }


campaign_service = CampaignService()
