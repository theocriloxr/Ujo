# Ujo hardware architecture and bill of materials

## System layers

```text
Mobile / Desktop / Web clients
          │ LAN HTTPS / optional E2EE remote gateway
          ▼
Ujo Edge Hub
  ├─ Ujo policy and audit services
  ├─ Ollama assistant / vision / embeddings
  ├─ Whisper STT + Piper TTS
  ├─ Home Assistant protocol adapter
  ├─ TLS MQTT broker
  ├─ Zigbee / Thread / Matter radio
  └─ Local encrypted storage
          │
          ├─ Certified Matter/Zigbee devices
          ├─ Ujo signed ESP32 sensor/control nodes
          ├─ ESPHome voice and IR satellites
          └─ Camera snapshot nodes
```

The hub is the authority. AI produces suggestions or typed proposals; deterministic policies, access checks and safety interlocks decide whether an action can be dispatched. A device must report the new state before Ujo reports success.

## Hub reference design

### Prototype / pilot hub

- x86-64 mini PC, 4+ efficient cores, 16 GB RAM, 512 GB NVMe SSD.
- TPM 2.0 where available; secure boot and full-disk encryption.
- Gigabit Ethernet as primary network; Wi-Fi/BLE for onboarding/fallback.
- Powered USB extension for radio separation.
- Zigbee/Thread coordinator compatible with Home Assistant and Matter.
- Optional region-approved Z-Wave coordinator.
- 12 V or USB-C power supply plus a monitored UPS.
- Active cooling, temperature monitoring and a nonflammable ventilated enclosure.

### Pi-class development hub

- Raspberry Pi 5, 8 GB RAM.
- USB 3 NVMe SSD; do not use an SD card as the only database storage.
- Official or adequately rated power supply and active cooler.
- UPS HAT with protected cells from a reputable supplier.

### Production carrier-board direction

A future custom carrier board should add a hardware watchdog, secure element/TPM, protected power input, UPS controller, tamper switch, service/recovery button, status LEDs, isolated console header, replaceable radio module and NVMe/eMMC storage. Do not start a custom motherboard until the mini-PC pilot confirms thermal, model and radio requirements.

## Custom Ujo node families

| Node | Reference hardware | Firmware/configuration | Purpose |
|---|---|---|---|
| Secure sensor/control | ESP32 + isolated I/O | `hardware/esp32-node` | Energy, water, food environment, presence and low-voltage control |
| Snapshot camera | AI Thinker ESP32-CAM + reed switch | `hardware/esp32-camera-node` | Event-triggered inventory snapshots, never continuous by default |
| Room voice | ESP32-S3-BOX-3 | `hardware/voice-satellite` | Local wake-word, microphone, speaker and mute controls |
| Legacy IR | ESP32 + IR receiver/transmitter driver | `hardware/ir-bridge` | Bench-verified TV/AC/fan remote codes through Home Assistant |

Third-party Matter/Zigbee locks, bulbs, plugs, thermostats and sensors do not receive Ujo firmware. They are commissioned through Home Assistant/Matter and bound to Ujo with explicit permissions.

## Sensor and actuator design

### Energy guardian

- Isolated energy meter such as PZEM-class hardware for prototypes or certified DIN-rail meters with Modbus for production.
- Current transformers/voltage sensing selected for the installation category.
- ESP32 controls only a low-voltage opto-isolated contactor driver.
- Certified breaker, RCD/RCBO, surge protection, contactor, manual bypass and enclosure.
- Independent under/over-voltage and motor protection where safety requires it.

### Water system

- Waterproof ultrasonic or pressure level sensor.
- Flow meter and leak sensors.
- Pump contactor with overload protection, dry-run protection and manual override.
- Independent high/low float switches for hard-wired protection; software must not be the sole overflow or dry-run control.

### Food zones

- BME280-class temperature/humidity sensing.
- SGP40-class broad VOC trend sensing.
- Optional calibrated ethylene-selective sensor only after laboratory characterization.
- DS18B20 or food-safe probe for compartment temperature.
- Condensation-resistant low-voltage enclosure and replaceable sensor cartridge.

MQ-135 and broad VOC sensors are not ethylene-selective and cannot prove that food is safe. Ujo must present estimates and confidence, not medical/food-safety guarantees.

### Presence and security

- mmWave presence plus door/window contact for reliable occupancy.
- Optional privacy-preserving local image classification only with explicit consent.
- Certified alarm panel and life-safety detectors remain independent systems; Ujo may integrate their status but must not replace certified fire/CO/security equipment.
- Access relays default fail-secure or fail-safe according to fire/building regulations and the specific door; this decision belongs to a qualified access-control engineer.

### Voice satellite

- Far-field microphone array or ESP32-S3-BOX-3 reference hardware.
- Speaker amplifier sized for the enclosure.
- Hardware microphone mute, mute LED, push-to-talk button and physical volume control.
- Local microWakeWord model for production; hub-side STT phrase matching only as a prototype fallback.

## Network and trust design

- Separate IoT VLAN; hub can reach nodes, but nodes cannot reach household computers.
- MQTT over TLS with a per-node broker username/password, topic ACL, independent message HMAC key and replay counters.
- Unique certificate/secret per manufactured unit; never share a fleet-wide node secret.
- Outbound-only remote tunnel; never port-forward MQTT, Ollama, Home Assistant or the database.
- Signed firmware, secure boot and encrypted flash for production ESP32 devices where supported.
- Device inventory records serial number, hardware revision, firmware hash, calibration, owner/home, installation date and revocation status.

## Prototype BOM categories

### Required

- One x86 mini PC or Pi 5 development hub.
- NVMe/SSD and monitored UPS.
- One Zigbee/Thread coordinator.
- One ESP32 development board for each node profile being tested.
- One ESP32-CAM and reed switch.
- One ESP32-S3 voice satellite.
- One power-monitoring smart plug for safe bench loads.
- Low-voltage relay board, LEDs and small DC fan/pump for demonstrations.
- Temperature/humidity, VOC, presence, leak, flow and tank-distance sensors.
- Enclosures, terminal blocks, fuses, protected power supplies and test equipment.

### Production pilot additions

- Certified DIN-rail meters/contactors and electrician-designed panels.
- Secure elements or hardware-backed keys.
- Tamper-evident enclosures and serialized labels.
- Spare hub, spare radios and recovery media.
- Calibration equipment and documented fixtures.
- Environmental, EMC, radio, electrical, battery and enclosure compliance testing for every target market.

## What must not be built as a casual prototype

Do not connect breadboards, exposed ESP32 boards or hobby relays directly to grid power, generators, inverters, heaters, pumps, locks, gates, gas valves or life-safety systems. The included code is a control/reference layer, not an electrical design certification. A qualified engineer must design the power/access panels and independent safety interlocks.
