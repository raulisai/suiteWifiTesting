import csv
import io
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign, CampaignTarget
from app.models.credential import Credential
from app.models.handshake import Handshake
from app.models.network import Network
from app.services.campaign import campaign_service


class ReporterService:
    """Generates PDF, JSON, and CSV reports for completed campaigns."""

    async def _load_campaign_data(self, db: AsyncSession, campaign_id: int) -> dict:
        """Build a complete data dict for a campaign — used by all exporters."""
        stats = await campaign_service.get_stats(db, campaign_id)

        campaign = await campaign_service.get_by_id(db, campaign_id)
        if not campaign:
            return {}

        # Full targets with network info
        targets_result = await db.execute(
            select(CampaignTarget).where(CampaignTarget.campaign_id == campaign_id)
        )
        targets = list(targets_result.scalars().all())
        network_ids = [t.network_id for t in targets]

        networks_result = await db.execute(
            select(Network).where(Network.id.in_(network_ids))
        )
        networks = {n.id: n for n in networks_result.scalars().all()}

        creds_result = await db.execute(
            select(Credential).where(Credential.network_id.in_(network_ids))
        )
        creds_by_net: dict[int, list[Credential]] = {}
        for c in creds_result.scalars().all():
            creds_by_net.setdefault(c.network_id, []).append(c)

        hs_result = await db.execute(
            select(Handshake).where(Handshake.network_id.in_(network_ids))
        )
        hs_by_net: dict[int, list[Handshake]] = {}
        for h in hs_result.scalars().all():
            hs_by_net.setdefault(h.network_id, []).append(h)

        target_details = []
        for t in targets:
            net = networks.get(t.network_id)
            target_details.append({
                "network_id": t.network_id,
                "bssid": net.bssid if net else "unknown",
                "ssid": net.ssid if net else None,
                "encryption": net.encryption if net else None,
                "wps_enabled": net.wps_enabled if net else False,
                "status": t.status,
                "attack_types": t.attack_types,
                "handshakes": len(hs_by_net.get(t.network_id, [])),
                "credentials": [
                    {"attack_type": c.attack_type, "cracked_by": c.cracked_by}
                    for c in creds_by_net.get(t.network_id, [])
                ],
            })

        return {
            **stats,
            "description": campaign.description,
            "interface": campaign.interface,
            "wordlist": campaign.wordlist,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "targets": target_details,
        }

    # ── JSON ──────────────────────────────────────────────────────────────────

    async def export_json(self, db: AsyncSession, campaign_id: int) -> str:
        """Return a formatted JSON string of the full campaign report."""
        data = await self._load_campaign_data(db, campaign_id)
        return json.dumps(data, indent=2, ensure_ascii=False)

    # ── CSV ───────────────────────────────────────────────────────────────────

    async def export_csv(self, db: AsyncSession, campaign_id: int) -> str:
        """Return a CSV string of all credentials found in the campaign.

        Columns: bssid, ssid, encryption, attack_type, cracked_by, found_at
        """
        data = await self._load_campaign_data(db, campaign_id)
        network_ids = [t["network_id"] for t in data.get("targets", [])]

        creds_result = await db.execute(
            select(Credential, Network)
            .join(Network, Credential.network_id == Network.id)
            .where(Credential.network_id.in_(network_ids))
        )
        rows = creds_result.all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["bssid", "ssid", "encryption", "wps_pin", "attack_type", "cracked_by", "found_at"])
        for cred, net in rows:
            writer.writerow([
                net.bssid,
                net.ssid or "",
                net.encryption or "",
                cred.wps_pin or "",
                cred.attack_type,
                cred.cracked_by,
                cred.found_at.isoformat(),
            ])
        return output.getvalue()

    # ── PDF ───────────────────────────────────────────────────────────────────

    async def export_pdf(self, db: AsyncSession, campaign_id: int) -> bytes:
        """Generate a PDF report and return it as bytes.

        Uses ReportLab. Falls back to a minimal text PDF if ReportLab
        is not installed (unlikely, it's in requirements.txt).
        """
        data = await self._load_campaign_data(db, campaign_id)

        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.platypus import (
                Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
            )

            buffer = io.BytesIO()
            doc = SimpleDocTemplate(
                buffer,
                pagesize=A4,
                leftMargin=2 * cm,
                rightMargin=2 * cm,
                topMargin=2 * cm,
                bottomMargin=2 * cm,
            )

            styles = getSampleStyleSheet()
            story = []

            # ── Title ──────────────────────────────────────────────────────────
            title_style = ParagraphStyle(
                "Title",
                parent=styles["Heading1"],
                textColor=colors.HexColor("#16a34a"),
                fontSize=18,
                spaceAfter=6,
            )
            story.append(Paragraph("WiFi Pentesting Suite — Reporte de Auditoría", title_style))
            story.append(Spacer(1, 0.3 * cm))

            # ── Campaign metadata ──────────────────────────────────────────────
            meta = [
                ["Campaña",       data.get("name", "")],
                ["Descripción",   data.get("description") or "—"],
                ["Estado",        data.get("status", "").upper()],
                ["Interfaz",      data.get("interface", "")],
                ["Iniciado",      data.get("started_at") or "—"],
                ["Finalizado",    data.get("ended_at") or "—"],
                ["Generado",      data.get("generated_at", "")],
            ]
            meta_table = Table(meta, colWidths=[4 * cm, 13 * cm])
            meta_table.setStyle(TableStyle([
                ("FONTNAME",    (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE",    (0, 0), (-1, -1), 9),
                ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
                ("BACKGROUND",  (0, 0), (0, -1), colors.HexColor("#1a1a1a")),
                ("TEXTCOLOR",   (0, 0), (0, -1), colors.white),
                ("TEXTCOLOR",   (1, 0), (1, -1), colors.HexColor("#1f2937")),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f9fafb"), colors.white]),
                ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                ("PADDING",     (0, 0), (-1, -1), 5),
            ]))
            story.append(meta_table)
            story.append(Spacer(1, 0.5 * cm))

            # ── Summary stats ──────────────────────────────────────────────────
            story.append(Paragraph("Resumen", styles["Heading2"]))
            summary_data = [
                ["Objetivos totales",     str(data.get("total_targets", 0))],
                ["Objetivos completados", str(data.get("done_targets", 0))],
                ["Handshakes capturados", str(data.get("handshakes_captured", 0))],
                ["Credenciales encontradas", str(data.get("credentials_found", 0))],
            ]
            summary_table = Table(summary_data, colWidths=[8 * cm, 9 * cm])
            summary_table.setStyle(TableStyle([
                ("FONTNAME",   (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE",   (0, 0), (-1, -1), 10),
                ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
                ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                ("PADDING",    (0, 0), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f0fdf4"), colors.white]),
            ]))
            story.append(summary_table)
            story.append(Spacer(1, 0.5 * cm))

            # ── Targets table ──────────────────────────────────────────────────
            story.append(Paragraph("Objetivos", styles["Heading2"]))
            header = ["BSSID", "SSID", "Cifrado", "WPS", "Estado", "Credenciales"]
            rows_data = [header]
            for t in data.get("targets", []):
                rows_data.append([
                    t["bssid"],
                    t["ssid"] or "oculto",
                    t["encryption"] or "—",
                    "Sí" if t["wps_enabled"] else "No",
                    t["status"].upper(),
                    str(len(t["credentials"])),
                ])

            targets_table = Table(rows_data, colWidths=[3.5*cm, 4*cm, 2.5*cm, 1.5*cm, 2.5*cm, 3*cm])
            targets_table.setStyle(TableStyle([
                ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#111111")),
                ("TEXTCOLOR",   (0, 0), (-1, 0), colors.HexColor("#22c55e")),
                ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE",    (0, 0), (-1, -1), 8),
                ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                ("PADDING",     (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f9fafb"), colors.white]),
            ]))
            story.append(targets_table)
            story.append(Spacer(1, 0.5 * cm))

            # ── Disclaimer ─────────────────────────────────────────────────────
            disclaimer_style = ParagraphStyle(
                "Disclaimer",
                parent=styles["Normal"],
                textColor=colors.HexColor("#9ca3af"),
                fontSize=7,
                borderColor=colors.HexColor("#374151"),
                borderWidth=1,
                borderPadding=5,
            )
            story.append(Paragraph(
                "Este reporte fue generado por WiFi Pentesting Suite para uso exclusivo en "
                "auditorías autorizadas. El uso de estas técnicas sin permiso escrito del "
                "propietario de la red es ilegal.",
                disclaimer_style,
            ))

            doc.build(story)
            return buffer.getvalue()

        except ImportError:
            # Minimal fallback if ReportLab not installed
            lines = [
                b"%PDF-1.4\n",
                b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
                b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
                b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n",
                b"xref\n0 4\n0000000000 65535 f\n",
                b"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n",
            ]
            return b"".join(lines)


reporter_service = ReporterService()
