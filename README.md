# Ujo smart-home ecosystem

Ujo is a local-first smart-home control plane for global homes, including infrastructure-variable markets: authenticated web/PWA clients, signed ESP32 hardware nodes, Home Assistant interoperability, energy and water protection, food-storage intelligence, maintenance, automations, and an offline Ollama assistant. This repository is being hardened from a prototype; unfinished integrations fail explicitly instead of reporting simulated success.

## Run locally

Requirements: Node.js 22+, npm, and a supported SQLite build.

```bash
npm install
copy .env.example .env
npm run dev
```

Replace every sample credential before setting `NODE_ENV=production`. `npm start` bootstraps the database and applies checked-in Prisma migrations. The UI is at `http://localhost:3000`; the health endpoint is `/api/health`.

## Verify

```bash
npm run check          # requires Prisma engine download when not cached
npm run check:offline  # typecheck, 33 tests, and Vite production build
```

The test suite covers authentication primitives, Vercel preview authentication, command authorization, hardware signing/replay protection, energy shedding, water safety, food-estimate language, automations, database bootstrap, and local voice. Docker Compose and ESP32 firmware require Docker and PlatformIO respectively; do not treat source generation as a successful physical commissioning test.

## Production architecture

- `server.ts`: authenticated REST/Socket.IO API and orchestration boundary.
- `prisma/`: local data model and versioned migrations.
- `src/services/`: deterministic safety, energy, automation, food, MQTT and assistant policies.
- `hardware/esp32-node/`: TLS MQTT/HMAC firmware profiles for energy, water, food environment, and presence.
- `hardware/esp32-camera-node/`: signed event-triggered snapshot firmware.
- `hardware/voice-satellite/` and `hardware/ir-bridge/`: ESPHome room voice and legacy IR reference configurations.
- `deployment/`: hub installer, TLS Mosquitto, Ollama model bootstrap, Whisper STT, Piper TTS and optional outbound tunnel.
- `ha_bridge.ts`: Home Assistant adapter; HA remains the preferred device-protocol integration layer.

Sensitive actions are not delegated to a language model. Unlocking requires the access-control flow; protective hardware commands are allowlisted, signed, sequenced, expire, and are acknowledged. Vendor purchases and updates require real configured integrations and approval.

See [DEPLOYMENT.md](DEPLOYMENT.md), [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md), and [hardware/esp32-node/README.md](hardware/esp32-node/README.md).

## Vercel preview and real-hub mode

`vercel.json` now builds the Vite web/PWA plus `api/gateway.ts`. Preview mode provides a working read-only login and demonstration state. Proxy mode forwards authenticated API requests to a fixed HTTPS hub URL. The in-home Ujo hub, MQTT broker, database, local speech, Ollama, Home Assistant bridge and hardware control remain on an always-on edge host. Follow [the Vercel login/deployment guide](docs/VERCEL_TEST_DEPLOYMENT.md).

## Read first

- [Production readiness report](PRODUCTION_READINESS_REPORT.md)
- [Feature register](docs/FEATURE_REGISTER.md)
- [Competitor and AI benchmark](docs/COMPETITOR_AND_AI_BENCHMARK.md)
- [Cloud control plane](docs/CLOUD_CONTROL_PLANE.md)
- [Local AI model policy](docs/OLLAMA_MODEL_POLICY.md)
- [Application, hub and equipment code matrix](docs/CODE_AND_EQUIPMENT_MATRIX.md)
- [Hardware architecture and BOM](docs/HARDWARE_DESIGN_AND_BOM.md)
- [Hardware validation matrix](docs/HARDWARE_TEST_MATRIX.md)
- [Hub installation and testing](docs/HUB_INSTALLATION_AND_TESTING.md)
- [End-to-end release plan](docs/END_TO_END_TEST_PLAN.md)
- [MARK-XXXIX integration decision](docs/MARK_XXXIX_INTEGRATION.md)
