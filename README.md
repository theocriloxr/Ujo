# Ujo OS: Master Developer Guide

Welcome to the internal documentation for the Ujo OS "JARVIS" prototype. This guide explains the neurological architecture of the system and how to extend it.

## 1. Project Structure

```text
/
├── backend/
│   ├── server.ts              # Bootstrap: Prisma, Socket.io, route registration
│   ├── routes/                # API route modules (devices, security, energy, system, voice)
│   ├── services/              # StateManager, ProactiveEngine, MQTT, Translator
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── ujo_os_v2.db       # SQLite database (created on first run)
│   ├── ha_bridge.ts
│   └── virtual_house.ts
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main UI shell and state wiring
│   │   ├── components/        # HUD cards, overlays, telemetry
│   │   ├── hooks/             # useSystemState, useSystemSocket
│   │   └── types/
│   └── vite.config.ts         # Dev proxy → backend :3005
├── package.json               # Root scripts (dev, build, lint)
├── Dockerfile
└── docker-compose.yml
```

## 2. Local Startup Instructions

1. **Requirements**: Node.js 20+.
2. **Install dependencies**:
   ```bash
   npm run install:all
   ```
3. **Environment**: Copy `.env.example` to `.env` at the repo root and set `GEMINI_API_KEY`, `JWT_SECRET`, and optional `HA_*` keys.
4. **Database**: On first run, Prisma creates `backend/prisma/ujo_os_v2.db` automatically (`DATABASE_URL=file:./prisma/ujo_os_v2.db` when running from `backend/`).
5. **Launch dev** (backend **:3005** + frontend **:5173**):
   ```bash
   npm run dev
   ```
6. **Access UI**: Open [http://localhost:5173](http://localhost:5173). API calls are proxied to the backend at port 3005.

### Production build

```bash
npm run build    # Vite → dist/
npm start        # Serves UI from backend on PORT (default 3005)
```

### Docker

```bash
docker compose up --build
```

Runs on port **3005** with SQLite persisted in the `ujo_data` volume at `/app/data/ujo_os_v2.db`.

## 3. Logic Flow Walkthrough

### Dynamic Load Shedding (Grid Guardian)

- **Trigger**: User selects inverter power in the UI → `POST /api/power-state`.
- **Execution**: `StateManager.setPowerState` updates `SystemConfig` and, when on inverter with auto-shedding enabled, turns off sheddable heavy devices.
- **Action**: Non-essential heavy loads are shed before the inverter is overloaded.

### Duress Protocol (Silent Security)

- **Input**: Keypad in the UI → `POST /api/security/unlock`.
- **Processing**: Normal PIN `1234` unlocks; duress PIN `9999` unlocks silently and sets `DURESS_ACTIVE` mode with a critical alert.

### Motion endpoints

- `POST /api/motion` — Away-mode intrusion vs welcome-home behavior.
- `POST /api/motion/simulate` — Demo motion broadcast (body: `{ room }`).

## 4. How to Modify: Add a New Device

1. **Seed**: Add a row in `seedData()` in `backend/server.ts`.
2. **UI icon**: Extend `getIcon()` in `frontend/src/components/DeviceHUDCard.tsx`.
3. **Toggle logic**: Update `toggleDevice()` in `frontend/src/App.tsx` for the new device id prefix.

## 5. Deployment Hardware Requirements

- **Core**: Raspberry Pi 5 (8GB recommended).
- **Storage**: NVMe SSD or high-endurance SD card.
- **Zigbee**: Sonoff Zigbee 3.0 USB dongle.
- **Voice**: ESP32-S3-BOX-3 distributed nodes.
