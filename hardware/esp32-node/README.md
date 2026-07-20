# Ujo ESP32 secure node

This is the production reference firmware for relay and low-voltage sensor nodes. It boots outputs into a configured fail-safe state, provisions Wi-Fi through a temporary captive portal, uses TLS for MQTT, signs every message with a unique per-node HMAC key, persists message counters, rejects replayed/stale commands, and acknowledges accepted commands.

## Flashing

1. Install VS Code and PlatformIO.
2. Copy `include/config.example.h` to `include/config.h`.
3. Give every board a unique `UJO_NODE_ID`, 32+ character `UJO_NODE_SECRET`, and MQTT credentials. Add the same node ID/secret to the hub's `UJO_NODE_KEYS_JSON`.
4. Paste the private MQTT CA certificate into `UJO_MQTT_CA`.
5. Flash one build: `pio run -e energy -t upload`, `pio run -e water -t upload`, `pio run -e food -t upload`, or `pio run -e presence -t upload`. Then run `pio device monitor`.
6. On first boot, join the temporary Wi-Fi network named after the node and provide the home Wi-Fi credentials.

## Reference pins

| Function | ESP32 pin | Notes |
|---|---:|---|
| Relay control | GPIO 26 | Drives only an opto-isolated relay/contactor input |
| Analog sensor | GPIO 34 | Input-only; never exceed 3.3 V |

## Device builds

| Build | Reference hardware | Measurements / controls |
|---|---|---|
| `energy` | PZEM-004T v3 with isolated UART | V, A, W, kWh, Hz, power factor; relay/contactor control |
| `water` | JSN-SR04T, YF-S201, leak switch | tank distance/level, flow, leak; pump relay |
| `food` | BME280, SGP40, DS18B20 | temperature, humidity, pressure, non-selective VOC trend |
| `presence` | mmWave module with occupancy output (for example LD2410) | binary presence only; no image or identity collection |

Calibrate tank full/empty distances in the installed tank, flow pulses against a known measured volume, and energy multipliers against a trusted meter. Treat failed or out-of-range sensors as unknown, never as proof that conditions are safe.

The SGP40 is a broad VOC trend sensor. It is not ethylene-selective and cannot determine whether food is safe to eat. An optional analog ethylene channel remains marked uncalibrated until a qualified calibration process is completed.

Never switch mains electricity on a breadboard or directly from an ESP32 module. Grid, generator, inverter, pump, AC, heater, and socket circuits require appropriately rated DIN-rail contactors, breakers, enclosures, isolation, and installation by a qualified electrician. The ESP32 must control only the isolated low-voltage side.

Do not use prototype sensors or software relays as the sole protection against overflow, dry running, fire, shock, or flooding. Install independent hard-wired floats, motor protection, breakers/RCDs, pressure relief, and manual isolation appropriate to the installation.
