# Ujo OS Delivery Manifest

**Delivery date:** 2026-07-20

## Delivered artifacts

- Hardened Ujo edge-hub and web/PWA source.
- Production Vite build in `dist/` plus a Vercel Function gateway with authenticated read-only preview and real-hub proxy modes.
- Explicit device-controller bindings and fail-closed command lifecycle.
- Home Assistant and signed MQTT acknowledgement reconciliation.
- Approval-isolated lock/access control.
- Simulation and fake telemetry disabled by default.
- ESP32 reference firmware update with signed, allowlisted reboot handling.
- Cloud control-plane schema, RLS policy, OpenAPI contract, and architecture scaffold.
- Offline Ollama model-routing policy, Docker service, profile-specific model bootstrap, embeddings/vision models, and factory preload script.
- Local faster-whisper STT, Piper TTS, hub-side custom phrase fallback, and ESPHome room voice satellite reference.
- Automated Debian/Ubuntu hub installer that generates secrets and MQTT certificates and starts the full AI/voice stack.
- Signed ESP32-CAM snapshot upload, generic sensor/control firmware, and an ESPHome IR bridge reference.
- Capacitor native-context/BLE onboarding scaffolds and a Tauri desktop shell.
- Complete Vercel, hub, hardware/BOM, and end-to-end test guides.
- Hardware-in-the-loop and failure-injection test matrix.
- Competitor/AI benchmark and feature register.
- MARK-XXXIX integration and trust-boundary specification.
- Separate safe MARK-XXXIX bridge patch.

## Verification completed in this environment

| Check | Result |
|---|---|
| TypeScript `tsc --noEmit` | Passed |
| Automated Node tests | 33 passed, 0 failed |
| Vite production build | Passed |
| Vercel gateway TypeScript bundle | Passed |
| Shell syntax and Python bytecode checks | Passed |
| Compose/ESPHome YAML parse | Passed |
| Firmware source inventory | Passed; PlatformIO compilation unavailable |
| Fresh SQLite migration application | Passed |
| Safe MARK-XXXIX bridge tests | 3 passed, 0 failed |
| Secret-file/private-key scan of delivery tree | No `.env`, credential file, or private-key header found |

## Verification that still requires the target environment

- `prisma generate` with the target Linux/ARM64 Prisma engine. This isolated environment could not download the engine binary.
- PlatformIO compilation and flashing for each selected ESP32 board/profile.
- Hardware-in-the-loop tests with actual relays, sensors, Home Assistant, Zigbee/Thread/Matter devices, UPS, and network failures.
- Native Android/iOS BLE commissioning, background geofencing, secure-keystore, notification tests, and signed store builds.
- Tauri desktop compilation/signing on Windows, macOS, and Linux.
- ESPHome compilation and room acoustic/wake-word tests.
- Docker installation, model downloads and inference performance on the selected physical hub.
- Cloud API implementation behind the supplied contract and tenant-isolation tests.
- Signed A/B OTA, rollback, manufacturing enrollment, secure-element provisioning, penetration testing, field pilots, and regulatory certification.

## Safety status

This delivery is a production-oriented software foundation. It is not approval to connect uncertified prototype hardware directly to mains electricity, door locks, gates, pumps, generators, gas valves, fire alarms, or other life-safety systems. Use certified interfaces and qualified electrical/security professionals.
