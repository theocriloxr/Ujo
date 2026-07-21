#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  hardware/esp32-node/platformio.ini
  hardware/esp32-node/src/main.cpp
  hardware/esp32-camera-node/platformio.ini
  hardware/esp32-camera-node/src/main.cpp
  hardware/voice-satellite/ujo-esp32-s3-box-3.yaml
  hardware/ir-bridge/ujo-ir-bridge.yaml
)
for file in "${required[@]}"; do
  [[ -s "$file" ]] || { echo "Missing firmware source: $file" >&2; exit 2; }
done

if ! command -v pio >/dev/null 2>&1; then
  echo "PlatformIO is not installed. Source-tree validation passed; physical firmware compilation was skipped."
  exit 0
fi

pio run -d hardware/esp32-node -e energy
pio run -d hardware/esp32-node -e water
pio run -d hardware/esp32-node -e food
pio run -d hardware/esp32-node -e presence
pio run -d hardware/esp32-camera-node -e ai-thinker-cam

echo "PlatformIO firmware builds passed. ESPHome YAML still requires an ESPHome 2026.4+ compile environment."
