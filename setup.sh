#!/usr/bin/env bash
# =============================================================================
# WiFi Pentesting Suite — Kali Linux Setup Script
#
# Usage:
#   chmod +x setup.sh
#   sudo ./setup.sh
#
# What it does:
#   1. Verifies you're on Linux with root
#   2. Installs all system tools via apt
#   3. Installs Python dependencies
#   4. Applies DB migrations (Alembic)
#   5. Installs Node.js dependencies and builds the frontend
#   6. Creates .env from .env.example if missing
#   7. Prints the start commands
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[*] $1${NC}"; }
ok()   { echo -e "${GREEN}[+] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
err()  { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }

# ── Guards ────────────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Linux" ]] || err "This tool only runs on Linux (Kali recommended)."
[[ "$EUID" -eq 0 ]]           || err "Run as root: sudo ./setup.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. System tools ───────────────────────────────────────────────────────────
log "Installing system tools via apt..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    aircrack-ng reaver wash \
    hcxdumptool hcxtools \
    hashcat bully macchanger \
    hostapd dnsmasq mdk4 crunch tshark \
    iw wireless-tools \
    python3 python3-pip python3-venv \
    nodejs npm \
    curl net-tools procps
ok "System tools installed."

# ── 2. Python dependencies ────────────────────────────────────────────────────
log "Installing Python dependencies..."
cd "$SCRIPT_DIR/backend"
pip3 install --quiet -r requirements.txt
ok "Python dependencies installed."

# ── 3. .env ───────────────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
    cp .env.example .env
    # Generate a random 48-char secret key
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(24))")
    sed -i "s|change-me-in-production-use-at-least-32-random-chars|${SECRET}|" .env
    ok ".env created with random SECRET_KEY."
else
    warn ".env already exists, skipping."
fi

# ── 4. DB migration ───────────────────────────────────────────────────────────
log "Applying database migrations..."
alembic upgrade head
ok "Database ready."

# ── 5. Frontend ───────────────────────────────────────────────────────────────
log "Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
ok "Frontend dependencies installed."

log "Building frontend..."
npm run build
ok "Frontend built → frontend/dist/"

# ── 6. Work dir ───────────────────────────────────────────────────────────────
mkdir -p /tmp/wifi_suite_captures
ok "Capture directory: /tmp/wifi_suite_captures"

# ── 7. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  WiFi Pentesting Suite — Setup Complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Start backend (requires root):${NC}"
echo -e "    cd backend"
echo -e "    sudo uvicorn main:app --host 0.0.0.0 --port 8000"
echo ""
echo -e "  ${CYAN}Start frontend dev server:${NC}"
echo -e "    cd frontend && npm run dev"
echo -e "    → http://localhost:5173"
echo ""
echo -e "  ${CYAN}Or serve the built frontend:${NC}"
echo -e "    sudo cp -r frontend/dist/* /var/www/html/"
echo -e "    → http://localhost"
echo ""
echo -e "  ${CYAN}API docs:${NC} http://localhost:8000/docs"
echo ""
echo -e "  ${YELLOW}Remember: plug in your WiFi adapter before starting.${NC}"
echo -e "  ${YELLOW}Verify monitor mode: sudo airmon-ng start wlan0${NC}"
echo ""
