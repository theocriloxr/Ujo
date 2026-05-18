# Ujo OS: Comprehensive System Documentation

## Project Overview

**Ujo OS** is a full-stack smart home operating system for privacy-conscious, power-aware homes (e.g. inverter/grid scenarios, domestic staff access, dialect intercom). Most hardware integrations are simulated; the architecture supports real MQTT, Home Assistant, and edge devices.

---

## Technical Stack

- **Frontend**: React 19, TypeScript, Vite (dev server **:5173**).
- **Backend**: Node.js, Express, Socket.io (**:3005**).
- **Database**: SQLite via Prisma (`backend/prisma/ujo_os_v2.db`).
- **AI**: Google Gemini (NLP + TTS on the client when `GEMINI_API_KEY` is set).
- **Styling**: Tailwind CSS, Framer Motion (`motion`), Recharts.

---

## Core File Structure

### Backend (`backend/`)

| Path | Role |
|------|------|
| `server.ts` | Bootstrap: seed data, MQTT, HA bridge, route mount, Vite/static in prod |
| `services/StateManager.ts` | Device/mode/power state, alerts, NLP, motion, duress |
| `routes/*.ts` | REST API split by domain |
| `services/ProactiveEngine.ts` | Background proactive checks |
| `services/TranslatorService.ts` | Dialect translation (Gemini, guarded) |
| `ha_bridge.ts` | Home Assistant WebSocket prototype |

### Frontend (`frontend/src/`)

| Path | Role |
|------|------|
| `App.tsx` | Layout, modals, voice/security flows, API actions |
| `hooks/useSystemState.ts` | Poll `/api/states` and HA status |
| `hooks/useSystemSocket.ts` | Socket.io live updates |
| `components/` | `DeviceHUDCard`, `DigitalTwinMockup`, `TelemetryStrip`, `VoiceCommandOverlay`, `AIOrb` |

---

## Key System Features

### AI Assistant (Ujo)

Natural language via `POST /api/nlp-parse`; client-side TTS via Gemini when configured, with browser `speechSynthesis` fallback.

### Grid Guardian

Selective load shedding when power source is `INVERTER`; per-device `isSheddable` flags.

### Duress Protocol

Dual PIN on `POST /api/security/unlock` (normal vs silent duress).

### Staff Access

Time-window profiles via `POST /api/access/staff-auth`.

### Guest QR

JWT guest sessions via `POST /api/security/guest-code`.

---

## Database Schema (Summary)

- `Device`, `SystemConfig`, `Alert`, `AccessProfile`, `VoiceSettings`, `GuestSession`, `SecurityAudit`, `EnergyTelemetry`

---

## Deployment

- **Dev**: `npm run install:all` then `npm run dev` → frontend :5173, backend :3005.
- **Prod**: `npm run build` then `npm start` (or Docker on port **3005**).
- **Env**: See `.env.example` (`DATABASE_URL`, `GEMINI_API_KEY`, `JWT_SECRET`, `HA_URL`, `HA_TOKEN`).
- **systemd**: `ujo-os.service` for Linux edge deployment.
