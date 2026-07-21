# Application, hub and equipment code matrix

## User applications

| Surface | Code | Current role |
|---|---|---|
| Responsive web/PWA | `src/`, `index.html`, `vite.config.ts` | Primary dashboard, authentication, state, controls and settings |
| Vercel gateway | `api/gateway.ts` | Preview login/read-only demo or authenticated proxy to a real hub |
| Android/iOS | `capacitor.config.ts`, `android/`, `ios/`, `mobile-native/` | Capacitor shell plus BLE onboarding, network, geofence and notification scaffolds |
| Desktop | `desktop/src-tauri/` | Tauri shell for Windows/macOS/Linux using the same authenticated UI |

## Hub software

| Service | Code | Function |
|---|---|---|
| Ujo core | `server.ts`, `src/services/` | Identity, policy, audit, automations, state reconciliation and APIs |
| Local database | `prisma/` | Single-home hub persistence and migrations |
| Hardware bus | `src/services/mqtt_handler.ts` | TLS MQTT, HMAC, replay protection, approval and acknowledgements |
| Home Assistant | `ha_bridge.ts` | Matter/Zigbee/Thread/Z-Wave and vendor integration boundary |
| Local assistant | `src/services/OllamaService.ts` | Schema-constrained action proposals, embeddings and local vision |
| AI health | `src/services/LocalAIRegistryService.ts` | Confirms assistant, embedding, vision, STT and TTS readiness |
| Speech | `deployment/local-stt`, `deployment/local-tts` | Local faster-whisper STT and Piper TTS |
| Model bootstrap | `deployment/ollama-init` | Pulls/preloads the selected Ollama models and creates `ujo-assistant` |
| Hub installation | `deployment/hub-installer` | OS packages, secrets, certificates, services and node credentials |
| Cloud fleet scaffold | `cloud-control-plane/` | Postgres tenant model, RLS, API contract and OTA/command design |

## Equipment that receives Ujo code

| Equipment | Code | Notes |
|---|---|---|
| Energy meter/relay node | `hardware/esp32-node`, `energy` environment | Isolated meter telemetry and low-voltage contactor control |
| Water tank/pump node | `hardware/esp32-node`, `water` environment | Tank, flow and leak telemetry; independent hard-wired protection required |
| Food environment node | `hardware/esp32-node`, `food` environment | Temperature, humidity and broad VOC trend; not a food-safety instrument |
| Presence node | `hardware/esp32-node`, `presence` environment | Privacy-preserving binary presence |
| Inventory camera | `hardware/esp32-camera-node` | Door-triggered signed snapshots, configurable retention |
| Room voice terminal | `hardware/voice-satellite` | ESPHome local wake-word/microphone/speaker endpoint |
| Legacy infrared bridge | `hardware/ir-bridge` | Learned IR codes through Home Assistant; no assumed state |

## Equipment integrated without Ujo firmware

Certified Matter/Zigbee/Thread/Z-Wave bulbs, plugs, thermostats, locks, blinds and sensors are commissioned through Home Assistant/Matter. Their manufacturer firmware remains intact; Ujo binds to their reported entities and applies its own authorization and policy layer.

Grid panels, generator/inverter interfaces, pumps, gates, door strikes and other high-consequence equipment require certified control panels and independent interlocks. Ujo code controls only the approved low-voltage interface and cannot substitute for electrical/access-control engineering.

## Not yet a completed retail binary

The repository contains source and reference firmware/configuration for every software layer, but mobile/desktop signing, ESPHome/PlatformIO compilation on selected boards, manufacturing images, model-license review, signed A/B OTA, cloud implementation, hardware certification and field validation must be completed on the target platforms before sale.
