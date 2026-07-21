# Ujo IR bridge

Use this ESPHome reference for low-risk infrared control of legacy TVs, fans and compatible air-conditioner remotes through Home Assistant. Capture each remote code, verify it on the bench, and create named Home Assistant scripts; bind Ujo to those scripts rather than letting the language model emit arbitrary IR payloads.

The transmitter output requires a transistor/MOSFET driver and current-limited IR LEDs. Do not drive high-current LEDs directly from an ESP32 GPIO. IR is not suitable as the only control path for safety-critical heaters, cookers, locks, gates or pumps because there is normally no confirmed device state.
