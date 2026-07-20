# Ujo system overview

## Trust boundaries

1. Clients authenticate with a revocable HttpOnly cookie or mobile bearer token.
2. The API validates authorization and converts requests into domain operations.
3. Deterministic policy decides whether an action is allowed, requires approval, or is rejected. Ollama can propose only structured, allowlisted actions and cannot unlock doors.
4. Hardware commands enter a durable queue and are signed for one provisioned node.
5. ESP32 nodes verify TLS, HMAC, timestamp and monotonic sequence before changing an output, then return a signed acknowledgement.

## Main capabilities

- Energy: source budgets, battery reserve, voltage protection, priority-based shedding, power and energy telemetry.
- Water: tank level, flow and leak monitoring; dry-run/overfill protective stops; independent hard-wired protection remains required.
- Food: inventory, observations, storage references, shopping list, conservative freshness estimates, and non-selective VOC trends without food-safety claims.
- Presence and geofencing: binary mmWave occupancy and phone-generated place enter/exit events; no continuous phone coordinates are stored.
- Maintenance: calendar/runtime/life/health due-state calculations and proactive alerts.
- Automation: sensor, schedule, presence, power-source and geofence triggers with single/restart/queued/parallel execution policies. Access control is excluded.
- Assistant: offline Ollama defaults (`qwen3:1.7b`, `qwen3:4b`, or `qwen3:8b` by hub capacity); local Piper speech first, cloud voice only with explicit opt-in.
- Interoperability: Home Assistant bridge today; Matter libraries are present but commissioning/bridge product work remains a release gate.

## Known release gates

- Commission every electrical and pump installation with qualified tradespeople and independent protection.
- Compile and bench-test every PlatformIO environment on the selected board/sensors.
- Run Docker Compose validation on the target Linux architecture.
- Configure backups, restore drills, TLS certificate rotation, monitoring and a signed update channel.
- Complete a threat model, dependency/SBOM scan, penetration test, long-duration soak test, power-loss/recovery tests, and radio/network outage tests.
- Package and test native Android/iOS shells if store distribution is required; the current app is an installable PWA.
