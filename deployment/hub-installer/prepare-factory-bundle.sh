#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo "Create .env first." >&2; exit 2; }
docker compose --profile ai --profile voice up -d --build ollama local-stt local-tts
docker compose --profile ai run --rm ollama-init
mkdir -p factory-bundle
docker run --rm -v ujo-production-complete_ollama_data:/source:ro -v "$PWD/factory-bundle":/dest alpine sh -c 'cd /source && tar czf /dest/ollama-models.tgz .'
docker run --rm -v ujo-production-complete_whisper_models:/source:ro -v "$PWD/factory-bundle":/dest alpine sh -c 'cd /source && tar czf /dest/whisper-models.tgz .'
tar czf factory-bundle/piper-voices.tgz -C deployment voices
sha256sum factory-bundle/*.tgz > factory-bundle/SHA256SUMS
cat > factory-bundle/README.txt <<TXT
These archives preload AI assets into a factory hub image. Restore them only onto trusted devices and keep model-license records with the manufactured unit. Docker Compose volume names can vary; inspect 'docker volume ls' before restoration.
TXT
echo "Factory AI bundle created in $ROOT/factory-bundle"
