# Ujo smart-home ecosystem

Ujo is a local-first smart-home control plane for Nigerian homes: authenticated web/PWA clients, signed ESP32 hardware nodes, Home Assistant interoperability, energy and water protection, food-storage intelligence, maintenance, automations, and an offline Ollama assistant. This repository is being hardened from a prototype; unfinished integrations fail explicitly instead of reporting simulated success.

## Run locally

Requirements: Node.js 22+, npm, and a supported SQLite build.

```bash
npm install
copy .env.example .env
npm run dev
```

Replace every sample credential before setting `NODE_ENV=production`. `npm start` bootstraps the database and applies checked-in Prisma migrations. The UI is at `http://localhost:3000`; the health endpoint is `/health`.

## Verify

```bash
npm run check
```

The test suite covers authentication primitives, command authorization, hardware signing/replay protection, energy shedding, water safety, food-estimate language, automations, database bootstrap, and local voice. Docker Compose and ESP32 firmware require Docker and PlatformIO respectively; do not treat source generation as a successful physical commissioning test.

## Production architecture

- `server.ts`: authenticated REST/Socket.IO API and orchestration boundary.
- `prisma/`: local data model and versioned migrations.
- `src/services/`: deterministic safety, energy, automation, food, MQTT and assistant policies.
- `hardware/esp32-node/`: TLS MQTT/HMAC firmware profiles for energy, water, food environment, and presence.
- `deployment/`: Mosquitto and optional local Piper speech service.
- `ha_bridge.ts`: Home Assistant adapter; HA remains the preferred device-protocol integration layer.

Sensitive actions are not delegated to a language model. Unlocking requires the access-control flow; protective hardware commands are allowlisted, signed, sequenced, expire, and are acknowledged. Vendor purchases and updates require real configured integrations and approval.

See [DEPLOYMENT.md](DEPLOYMENT.md), [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md), and [hardware/esp32-node/README.md](hardware/esp32-node/README.md).
