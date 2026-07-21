#!/usr/bin/env bash
set -euo pipefail
VOICE="${PIPER_MODEL_FILE:-en_GB-alan-medium.onnx}"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium"
DEST="${1:-deployment/voices}"
mkdir -p "$DEST"
curl --fail --location --retry 3 "$BASE/$VOICE" -o "$DEST/$VOICE"
curl --fail --location --retry 3 "$BASE/$VOICE.json" -o "$DEST/$VOICE.json"
echo "Downloaded Piper voice $VOICE. Review its model card/license before commercial distribution."
