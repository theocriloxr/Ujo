#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${UJO_INSTALL_DIR:-/opt/ujo}"
NODE_ID="${1:-}"
[[ "$NODE_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$ ]] || { echo "Usage: $0 <node-id>" >&2; exit 2; }
cd "$INSTALL_DIR"
[[ -f .env ]] || { echo "$INSTALL_DIR/.env is missing." >&2; exit 2; }
NODE_SECRET="$(openssl rand -hex 32)"
MQTT_NODE_PASSWORD="$(openssl rand -hex 24)"

python3 - "$NODE_ID" "$NODE_SECRET" <<'PY'
import json, sys
from pathlib import Path
node_id, secret = sys.argv[1:]
path = Path('.env')
lines = path.read_text().splitlines()
updated = False
for i, line in enumerate(lines):
    if line.startswith('UJO_NODE_KEYS_JSON='):
        raw = line.split('=', 1)[1].strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f'Invalid UJO_NODE_KEYS_JSON in .env: {error}')
        data[node_id] = secret
        lines[i] = 'UJO_NODE_KEYS_JSON=' + json.dumps(data, separators=(',', ':'))
        updated = True
        break
if not updated:
    lines.append('UJO_NODE_KEYS_JSON=' + json.dumps({node_id: secret}, separators=(',', ':')))
path.write_text('\n'.join(lines) + '\n')
PY
chmod 600 .env

docker exec ujo-mqtt sh -c 'touch /mosquitto/data/passwords'
docker exec ujo-mqtt mosquitto_passwd -b /mosquitto/data/passwords "$NODE_ID" "$MQTT_NODE_PASSWORD"
docker kill --signal=HUP ujo-mqtt >/dev/null
docker compose up -d --no-deps --force-recreate ujo-core >/dev/null

OUTPUT="${UJO_NODE_OUTPUT:-$PWD/${NODE_ID}-provisioning.txt}"
umask 077
cat > "$OUTPUT" <<DATA
UJO_NODE_ID=$NODE_ID
UJO_NODE_SECRET=$NODE_SECRET
UJO_MQTT_USERNAME=$NODE_ID
UJO_MQTT_PASSWORD=$MQTT_NODE_PASSWORD
UJO_MQTT_HOST=$(hostname -I | awk '{print $1}')
UJO_MQTT_PORT=8883
MQTT_CA_FILE=$PWD/deployment/mosquitto/certs/ca.crt
DATA
chmod 600 "$OUTPUT"
echo "Node credentials created at: $OUTPUT"
echo "Copy them once to the board's private config, then move/delete this file securely. Provision allowed actions separately in the owner UI."
