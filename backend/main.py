import os
import platform
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.process.manager import process_manager
from app.process.queue import attack_queue

# ── Linux-only guard ───────────────────────────────────────────────────────────
# This backend controls physical WiFi hardware (monitor mode, packet injection).
# These kernel-level operations are Linux-only and require root privileges.
# Running on macOS or Windows will NOT work — use a Kali Linux machine.
if platform.system() != "Linux":
    print(
        "\n[ERROR] WiFi Pentesting Suite only runs on Linux.\n"
        "        airmon-ng, airodump-ng, aireplay-ng and reaver require\n"
        "        Linux kernel interfaces (nl80211 / cfg80211).\n"
        "        Use a Kali Linux machine or VM with a USB WiFi adapter\n"
        "        that supports monitor mode (e.g. TP-Link Archer T2U Plus).\n",
        file=sys.stderr,
    )
    sys.exit(1)

if os.geteuid() != 0:
    print(
        "\n[ERROR] Must run as root.\n"
        "        WiFi interface control requires root privileges.\n"
        "        Use: sudo uvicorn main:app --host 0.0.0.0 --port 8000\n",
        file=sys.stderr,
    )
    sys.exit(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown logic."""
    # ── Startup ────────────────────────────────────────────────────────────────
    os.makedirs(settings.work_dir, exist_ok=True)
    await init_db()
    await attack_queue.start()

    yield  # Application is running

    # ── Shutdown ───────────────────────────────────────────────────────────────
    await process_manager.kill_all()
    await attack_queue.stop()


app = FastAPI(
    title="WiFi Pentesting Suite API",
    description="Backend API for authorized wireless network auditing.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # alternative
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
from app.api.routes.environment import router as environment_router  # noqa: E402
from app.api.routes.networks import router as networks_router        # noqa: E402
from app.api.routes.attacks import router as attacks_router          # noqa: E402
from app.api.routes.campaigns import router as campaigns_router      # noqa: E402
from app.api.routes.credentials import router as credentials_router  # noqa: E402
from app.api.routes.reports import router as reports_router          # noqa: E402

app.include_router(environment_router)
app.include_router(networks_router)
app.include_router(attacks_router)
app.include_router(campaigns_router)
app.include_router(credentials_router)
app.include_router(reports_router)


@app.get("/health")
async def health():
    """Simple liveness check."""
    return {"status": "ok", "env": settings.app_env}
