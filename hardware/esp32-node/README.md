# Ujo ESP32 secure node

This is the reference firmware for relay and low-voltage sensor nodes. It boots outputs into a configured fail-safe state, provisions Wi-Fi through a temporary captive portal, uses TLS for MQTT, signs every message with a unique per-node HMAC key, persists message counters, rejects replayed/stale commands, and acknowledges accepted commands.

## Flashing

1. Install VS Code and PlatformIO.
2. Copy `include/config.example.h` to `include/config.h`.
3. Give every board a unique `UJO_NODE_ID`, 32+ character `UJO_NODE_SECRET`, and MQTT credentials. Add the same node ID/secret to the hub's `UJO_NODE_KEYS_JSON`.
4. Paste the private MQTT CA certificate into `UJO_MQTT_CA`.
5. Connect by USB and run `pio run --target upload`, then `pio device monitor`.
6. On first boot, join the temporary Wi-Fi network named after the node and provide the home Wi-Fi credentials.

## Reference pins

| Function | ESP32 pin | Notes |
|---|---:|---|
| Relay control | GPIO 26 | Drives only an opto-isolated relay/contactor input |
| Analog sensor | GPIO 34 | Input-only; never exceed 3.3 V |

Never switch mains electricity on a breadboard or directly from an ESP32 module. Grid, generator, inverter, pump, AC, heater, and socket circuits require appropriately rated DIN-rail contactors, breakers, enclosures, isolation, and installation by a qualified electrician. The ESP32 must control only the isolated low-voltage side.
