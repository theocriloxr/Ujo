# End-to-end test and release plan

## Stage 1 — Vercel preview

- Deploy with `UJO_GATEWAY_MODE=preview`.
- Confirm login, token expiry, invalid-password handling and logout.
- Confirm all physical mutations return read-only errors.
- Confirm mobile and desktop responsive layouts.

## Stage 2 — Hub on a development machine

- Run the hub stack with no hardware attached.
- Confirm database bootstrap, restart persistence and encrypted backups.
- Confirm Ollama alias, embeddings, vision status, STT and TTS.
- Confirm an unavailable AI service never blocks deterministic controls.
- Confirm no secret appears in logs or frontend assets.

## Stage 3 — Secure remote connection

- Create the outbound tunnel and switch Vercel to proxy mode.
- Confirm exact-origin CORS policy and TLS.
- Test expired sessions, revoked sessions, tunnel outage and hub outage.
- Confirm polling fallback and state recovery.

## Stage 4 — Sensor-only hardware

- Flash each sensor profile without actuators.
- Test valid signatures, bad signatures, replayed sequence, stale timestamp and wrong node ID.
- Disconnect Wi-Fi/sensors/power and verify `UNKNOWN`/`OFFLINE` state.
- Calibrate every installed sensor and store calibration records.

## Stage 5 — Low-voltage actuators

- Use LEDs, a small DC fan, miniature pump and solenoid test latch.
- Verify allowlists, owner approval, command expiry, acknowledgement timeout and state reconciliation.
- Confirm restart and network loss return to the documented fail-safe state.

## Stage 6 — Local voice

- Test push-to-talk, wake word, hard mute and visual listening indicator.
- Test multiple speakers, background noise, accents and false activations.
- Verify transcripts/audio are not retained unless explicitly enabled.
- Verify sensitive actions require the dedicated authentication flow.

## Stage 7 — Controlled home pilot

- Professional installation with independent breakers, contactors and safety controls.
- At least 30 days of mains/inverter/generator transitions, internet outages and hub restarts.
- Measure false alerts, missed alerts, command latency, energy savings and user overrides.
- Run restore drills and a full hub replacement drill.

## Stage 8 — Commercial release gate

Release only after independent penetration testing, SBOM/vulnerability review, privacy impact assessment, electrical/radio/EMC/battery compliance, installer procedures, incident response, signed OTA with rollback, manufacturing key provisioning and customer support runbooks have passed.
