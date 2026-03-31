# WiFi Pentesting Suite

Open-source wireless audit suite with a real-time React dashboard.
Wraps `aircrack-ng`, `reaver`, `hcxtools`, `hashcat` and more behind a
FastAPI + WebSocket backend.

> **For authorized use only.** See [DISCLAIMER.md](DISCLAIMER.md).

---

## Platform Requirements

> **This tool ONLY runs on Linux.**

| Requirement | Details |
|---|---|
| OS | **Kali Linux** (recommended) or any Debian-based distro |
| Privileges | **root** — required for interface control |
| WiFi adapter | Must support **monitor mode** + **packet injection** |
| Kernel modules | Must be loaded on the host (e.g. `rtl8821au` for TP-Link Archer T2U Plus) |
| Python | 3.11+ |
| Node.js | 20+ (frontend only) |

### Why not Docker for the backend?

Docker **cannot** be used for the backend because:

1. `airmon-ng` / `iw` manipulate **kernel network namespaces** — operations that
   require the physical host kernel, not a container namespace.
2. **USB WiFi adapters** (e.g. TP-Link Archer T2U Plus with RTL8821AU) need their
   kernel module (`rtl8821au.ko`) loaded on the **host OS**. Docker containers
   do not load kernel modules.
3. Monitor mode is set at the **phy layer** (nl80211/cfg80211) — this is a host
   kernel interface, not addressable from inside a container even with
   `--privileged` + `--net=host`.

**Rule:** Backend runs natively on Kali Linux. Docker is optional only for the
frontend (nginx + React build).

---

## Tested Hardware

| Adapter | Chipset | Monitor Mode | Injection | Driver |
|---|---|---|---|---|
| TP-Link Archer T2U Plus | RTL8821AU | ✓ | ✓ | `rtl8821au` |
| Alfa AWUS036ACH | RTL8812AU | ✓ | ✓ | `rtl8812au` |
| Alfa AWUS036NHA | AR9271 | ✓ | ✓ | `ath9k_htc` |
| Panda PAU09 | RT5572 | ✓ | ✓ | `rt2800usb` |

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 · FastAPI · SQLAlchemy 2 async · SQLite |
| Real-time | WebSockets (uvicorn) |
| Tools | aircrack-ng · reaver · hcxdumptool · hashcat |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Zustand |
| Reports | ReportLab PDF · JSON · CSV |

---

## Installation (Kali Linux — Native)

### 1 — Install system tools

```bash
sudo apt update && sudo apt install -y \
    aircrack-ng reaver wash \
    hcxdumptool hcxtools \
    hashcat bully macchanger \
    hostapd dnsmasq mdk4 crunch tshark \
    iw wireless-tools python3 python3-pip nodejs npm
```

### 2 — Install driver for your adapter (example: RTL8821AU)

```bash
sudo apt install -y dkms git
git clone https://github.com/aircrack-ng/rtl8821au.git
cd rtl8821au
sudo make dkms_install
# Plug in your adapter and verify:
iw dev
```

### 3 — Clone & configure

```bash
git clone <repo-url>
cd wifi-pentesting-suite
cp backend/.env.example backend/.env
# Edit SECRET_KEY in backend/.env — minimum 32 random characters
nano backend/.env
```

### 4 — Backend

```bash
cd backend
pip3 install -r requirements.txt

# Apply DB migrations
alembic upgrade head

# Start (root is required)
sudo uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 5 — Frontend

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

> For production, build and serve with nginx:
> ```bash
> npm run build        # outputs to frontend/dist/
> sudo cp -r dist/* /var/www/html/
> ```

---

## Verify your adapter supports monitor mode

```bash
# Put adapter in monitor mode manually to test
sudo airmon-ng check kill
sudo airmon-ng start wlan0

# You should see wlan0mon
iwconfig wlan0mon    # must show Mode:Monitor

# Test injection
sudo aireplay-ng --test wlan0mon   # should show "Injection is working!"

# Restore
sudo airmon-ng stop wlan0mon
sudo systemctl start NetworkManager
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/environment/summary` | Dashboard badge |
| GET | `/api/environment/check` | All 17 tools with versions |
| WS  | `/api/environment/install/stream` | Streaming apt install |
| GET | `/api/networks` | Stored networks |
| POST | `/api/networks/scan` | Blocking scan |
| WS  | `/api/networks/scan/stream` | Real-time scan |
| WS  | `/api/attacks/handshake` | WPA handshake capture + deauth |
| WS  | `/api/attacks/wps` | WPS Pixie Dust / brute-force |
| WS  | `/api/attacks/pmkid` | PMKID capture |
| WS  | `/api/attacks/crack` | Offline cracking (aircrack / hashcat) |
| GET/POST | `/api/campaigns` | Campaign CRUD |
| WS  | `/api/campaigns/{id}/stream` | Run campaign live |
| GET | `/api/credentials` | All found credentials |
| GET | `/api/reports/{id}/pdf` | PDF report |
| GET | `/api/reports/{id}/json` | JSON report |
| GET | `/api/reports/{id}/csv` | CSV credentials |

Full Swagger docs at: `http://localhost:8000/docs`

---

## Frontend Only via Docker (Optional)

If you want to run only the **frontend** in Docker while the backend runs
natively on the same machine:

```bash
docker build -f Dockerfile.frontend -t wifi-suite-frontend .
docker run -p 80:80 wifi-suite-frontend
```

The nginx config proxies `/api` to `localhost:8000` on the host.

---

## Development

```bash
# Backend tests
cd backend
pytest tests/ -v --tb=short

# Linting
ruff check app/
mypy app/

# Frontend
cd frontend
npm run lint
npm run build
```

---

## Project Structure

```
wifi-pentesting-suite/
├── backend/
│   ├── app/
│   │   ├── core/          # config, database, auth, deps
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic request/response
│   │   ├── tools/         # one async wrapper per binary
│   │   ├── process/       # process manager, WS stream, attack queue
│   │   ├── services/      # environment, scanner, attacker, cracker, campaign, reporter
│   │   └── api/routes/    # FastAPI routers
│   ├── migrations/        # Alembic versioned schema
│   └── tests/             # pytest async test suite
└── frontend/
    └── src/
        ├── api/           # axios typed layer
        ├── store/         # Zustand global state
        ├── hooks/         # custom React hooks
        ├── components/    # reusable UI components
        └── pages/         # route-level pages
```

---

## Roadmap

- [x] Phase 1 — Environment checker & streaming installer
- [x] Phase 2 — Network scanner + attack engine (Handshake, WPS, PMKID, Crack)
- [x] Phase 3 — React frontend with live terminal dashboard
- [x] Phase 4 — Campaigns, Credentials, PDF/JSON/CSV reports
- [ ] Phase 5 — JWT login page + user management
- [ ] Phase 6 — Evil Twin / captive portal (hostapd + dnsmasq)
- [ ] Phase 7 — WPA3 Dragonblood (DragonSlayer integration)
- [ ] Phase 8 — Scheduled campaigns (cron-based automation)

---

## License

MIT — see [LICENSE](LICENSE).
