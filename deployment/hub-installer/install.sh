#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then echo "Run with sudo/root." >&2; exit 1; fi
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_DIR="${UJO_INSTALL_DIR:-/opt/ujo}"
ADMIN_EMAIL="${UJO_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${UJO_ADMIN_PASSWORD:-}"
OWNER_PIN="${UJO_OWNER_PIN:-}"
DURESS_PIN="${UJO_DURESS_PIN:-}"
STAFF_PIN="${UJO_STAFF_PIN:-}"
VERCEL_ORIGIN="${UJO_VERCEL_ORIGIN:-}"
[[ "$ADMIN_EMAIL" == *"@"* ]] || { echo "Set UJO_ADMIN_EMAIL." >&2; exit 2; }
[[ ${#ADMIN_PASSWORD} -ge 12 ]] || { echo "Set UJO_ADMIN_PASSWORD to at least 12 characters." >&2; exit 2; }
[[ "$OWNER_PIN" =~ ^[0-9]{4,12}$ ]] || { echo "Set UJO_OWNER_PIN (4-12 digits)." >&2; exit 2; }
[[ "$DURESS_PIN" =~ ^[0-9]{4,12}$ && "$DURESS_PIN" != "$OWNER_PIN" ]] || { echo "Set a distinct UJO_DURESS_PIN." >&2; exit 2; }
[[ "$STAFF_PIN" =~ ^[0-9]{4,12}$ ]] || { echo "Set UJO_STAFF_PIN." >&2; exit 2; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl openssl jq rsync docker.io docker-compose-plugin avahi-daemon
systemctl enable --now docker avahi-daemon
install -d -m 0750 "$INSTALL_DIR"
rsync -a --delete --exclude node_modules --exclude .git --exclude .env "$SOURCE_DIR/" "$INSTALL_DIR/"
cd "$INSTALL_DIR"

TOTAL_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if (( TOTAL_KB < 11000000 )); then PROFILE=pi; elif (( TOTAL_KB < 26000000 )); then PROFILE=mini; else PROFILE=workstation; fi
IP_VALUE=$(hostname -I | awk '{print $1}')
HOST_VALUE="ujo-home.local"
export UJO_HUB_IP="$IP_VALUE" UJO_HUB_HOSTNAME="$HOST_VALUE"
bash deployment/hub-installer/generate-certs.sh
bash deployment/hub-installer/download-voice.sh

rand() { openssl rand -hex 32; }
ORIGINS="http://$HOST_VALUE:3000,http://$IP_VALUE:3000,capacitor://localhost"
[[ -n "$VERCEL_ORIGIN" ]] && ORIGINS="$ORIGINS,$VERCEL_ORIGIN"
cat > .env <<ENV
PORT=3000
JWT_SECRET=$(rand)
UJO_OWNER_PIN=$OWNER_PIN
UJO_DURESS_PIN=$DURESS_PIN
UJO_STAFF_PIN=$STAFF_PIN
UJO_BRIDGE_TOKEN=$(rand)
UJO_ADMIN_EMAIL=$ADMIN_EMAIL
UJO_ADMIN_PASSWORD=$ADMIN_PASSWORD
APP_ORIGINS=$ORIGINS
MQTT_USERNAME=ujo_hub
MQTT_PASSWORD=$(rand)
UJO_NODE_KEYS_JSON={}
UJO_HUB_PROFILE=$PROFILE
OLLAMA_MODEL=ujo-assistant
UJO_EMBED_MODEL=embeddinggemma
UJO_ENABLE_VISION=true
LOCAL_STT_MODEL=small.en
LOCAL_STT_DEVICE=cpu
LOCAL_STT_COMPUTE_TYPE=int8
LOCAL_STT_LOCAL_ONLY=false
LOCAL_TTS_VOICE=en_GB-alan-medium
PIPER_MODEL_FILE=en_GB-alan-medium.onnx
ALLOW_CLOUD_VOICE=false
HA_URL=http://host.docker.internal:8123
HA_TOKEN=
UJO_ENABLE_SIMULATION=false
UJO_ALLOW_MANUAL_POWER_SOURCE=false
UJO_WAKE_PHRASES=hey ujo,okay ujo
CLOUDFLARE_TUNNEL_TOKEN=
ENV
chmod 600 .env

docker compose --profile ai --profile voice up -d --build
for _ in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then break; fi
  sleep 5
done
curl -fsS http://127.0.0.1:3000/api/health | jq . || { echo "Hub did not become healthy. Run: docker compose logs" >&2; exit 3; }
cat <<DONE
Ujo hub installed.
Local URL: http://$IP_VALUE:3000
Local hostname: http://$HOST_VALUE:3000
Profile: $PROFILE
Admin email: $ADMIN_EMAIL
Keep /opt/ujo/.env and deployment/mosquitto/certs private.
DONE
