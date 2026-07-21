# Hardware and Firmware Validation Matrix

The included ESP32 code is reference firmware. Use isolated low-voltage benches until a qualified hardware/electrical engineer approves the design.

| Area | Required test | Pass condition |
|---|---|---|
| Provisioning | Unknown node attempts connection | No command accepted; event audited |
| Node key | Wrong HMAC/key | Envelope rejected |
| Replay | Repeat sequence/envelope | Rejected across restart using persisted sequence |
| Time | Old/future timestamp | Rejected outside configured skew |
| Command | Duplicate command ID | Idempotent; no repeated relay actuation |
| Ack | Missing ack | Command times out and UI shows failure/unknown |
| State | Ack says success but telemetry disagrees | `STATE_MISMATCH`; no success claim |
| Network | Broker loss during command | Safe state retained; reconnect without replay |
| Power | Hub brownout/restart | Filesystem survives; service auto-recovers |
| Watchdog | Firmware deadlock | Hardware watchdog resets and reports reason |
| Relay | Boot/reset | Fail-safe output, no unintended pulse |
| Sensor | Disconnected/shorted sensor | Explicit invalid/fault state, not zero value |
| Calibration | Reference instruments | Error within documented tolerance |
| OTA | Interrupted update | Previous signed firmware boots |
| OTA | Unsigned/downgraded image | Rejected |
| Storage | Full disk | Telemetry retention trims safely; controls continue |
| Heat | Sustained AI load | No unsafe enclosure temperature or throttling failure |
| Access | Repeated invalid PIN | Rate limited; no disclosure; audit recorded |
| Duress | Duress code | Normal outward response, private alert path tested |
| Manual override | Hub unavailable | Essential equipment remains manually operable |
| Privacy | Microphone mute | Electrical/hardware mute verifiably blocks capture |

## Sensor-specific rules

### Food environment

- Treat SGP40/MQ-series readings as broad VOC trends, not specific ethylene measurement or proof that food is safe/unsafe.
- Calibrate per enclosure, airflow, humidity, temperature, and cleaning chemicals.
- Combine shelf-life reference, acquisition/opening dates, cold-chain excursions, visual observation, VOC trend, and user confirmation.

### Energy

- Use isolated, certified metering hardware and contactors.
- Never connect hobby voltage modules directly to mains in a sellable product.
- Implement hysteresis, compressor minimum-off times, neutral/earth fault handling, and electrician commissioning.

### Water/pumps

- Add dry-run, no-flow, overflow, leak, stuck-relay, and manual-isolator protections.
- Pump control must fail safely and meet local electrical/plumbing code.

### Locks/security

- Prefer certified Matter/Home Assistant lock integrations for early pilots.
- Final custom hardware requires secure element, anti-tamper, battery/low-voltage behavior, mechanical override, fire-egress compliance, and independent penetration testing.
