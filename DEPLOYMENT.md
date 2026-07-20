# Production deployment and commissioning

## Hub

Use a 64-bit Linux mini PC for the normal `qwen3:4b` profile; a Pi-class hub uses `qwen3:1.7b`, while an adequately cooled workstation can use `qwen3:8b`. Prefer mirrored/reliable SSD storage and a UPS. Do not use a consumer SD card as the only database copy.

1. Install Docker Engine with Compose on the target host.
2. Copy `.env.example` to `.env`; replace every secret and set the public HTTPS origin.
3. Create a private MQTT CA plus broker certificate/key as described in `deployment/README.md`.
4. Put a licensed Piper ONNX voice and matching JSON in `deployment/voices/`.
5. Start core services: `docker compose up -d`. Add offline AI and voice with `docker compose --profile ai --profile voice up -d`.
6. Pull the chosen model: `docker exec ujo-ollama ollama pull qwen3:4b`.
7. Verify `/health`, authenticated login, MQTT TLS, database persistence and restore before pairing actuators.

Terminate public access at a maintained HTTPS reverse proxy or VPN. Never expose MQTT, Ollama, Piper, SQLite, or Home Assistant directly to the internet.

## Hardware commissioning

Flash the matching PlatformIO environment from `hardware/esp32-node`. Each node needs a unique ID, a unique random 32+ character HMAC secret, broker credentials, and the MQTT CA. Register the same node ID/key on the hub.

Commission in stages: sensor-only bench test, fail-safe and power-loss test, command replay/tamper test, isolated relay test, then qualified installation. Record calibration values and hardware serial numbers. Verify that loss of Wi-Fi, hub, MQTT, clock, or sensor produces the safe physical state.

Grid, generator, inverter, pump and mains work requires rated breakers/RCDs, contactors, enclosures, earthing, isolation, manual override, and installation under applicable Nigerian electrical rules by qualified professionals.

## Operations

- Back up the SQLite volume encrypted; restore it regularly on a separate host.
- Rotate web, bridge, MQTT and node credentials; revoke lost phones and retired nodes.
- Monitor disk, memory, temperature, database integrity, broker disconnects, stale telemetry and unacknowledged commands.
- Keep a rollback image. Do not enable OTA until signed manifests and signature verification exist.
- Treat AI, freshness, predictive maintenance and sensor results as assistance, not emergency or professional safety certification.
