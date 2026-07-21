# Ujo ESP32-CAM snapshot node

Captures a JPEG only on a configured reed-switch transition and uploads it to the hub with a per-node HMAC, timestamp, SHA-256 body hash, and persistent replay counter. It does not stream continuous video.

1. Copy `include/config.example.h` to `include/config.h` and provision a unique node secret in the hub's `UJO_NODE_KEYS_JSON`.
2. Set `UJO_HUB_TLS=true` and install the hub CA for production. Plain HTTP is only for an isolated prototype LAN.
3. Build with `pio run -e ai-thinker-cam -t upload`.
4. Wire the door/reed switch to `UJO_TRIGGER_PIN` and ground. Verify polarity before installation.

The hub stores snapshots under its protected data volume and logs only metadata in SQLite. The camera is an inventory aid, not a security or food-safety instrument. Do not place an unprotected ESP32-CAM where condensation can reach the board; use a sealed enclosure, low-voltage supply, and a lens window designed for the temperature/humidity range.
