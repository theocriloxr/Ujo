# Ujo hub installation, embedded AI and test deployment

## Recommended test hardware

For a complete prototype, use an x86-64 mini PC with 16 GB RAM, 512 GB NVMe storage, gigabit Ethernet, Wi-Fi/Bluetooth, active cooling and a small UPS. A Raspberry Pi 5 with 8 GB RAM and an SSD can run the reduced `pi` model profile, but it is not the preferred production hardware for multi-camera or heavier vision workloads.

## One-command Linux installation

Use Ubuntu Server or Debian 64-bit on the hub. Copy the repository to the hub, then run:

```bash
cd Ujo-production-complete
sudo env \
  UJO_ADMIN_EMAIL='owner@example.com' \
  UJO_ADMIN_PASSWORD='replace-with-a-long-unique-password' \
  UJO_OWNER_PIN='change-this-pin' \
  UJO_DURESS_PIN='use-a-different-pin' \
  UJO_STAFF_PIN='use-another-pin' \
  UJO_VERCEL_ORIGIN='https://YOUR-DEPLOYMENT.vercel.app' \
  bash deployment/hub-installer/install.sh
```

The installer:

- installs Docker Engine, Compose, Avahi, OpenSSL and required utilities;
- copies Ujo to `/opt/ujo`;
- selects a Pi, mini-PC or workstation model profile from installed RAM;
- generates a private MQTT CA and broker certificate;
- generates application, bridge and MQTT secrets;
- downloads the configured Piper voice;
- starts the hub, MQTT, Ollama, model bootstrap, local Whisper and local Piper services;
- pulls the assistant, embedding and optional vision models; and
- creates the `ujo-assistant` model alias with Ujo's safety system prompt.

## Embedded model profiles

| Hub profile | Assistant base | Vision | Embeddings | Practical minimum |
|---|---|---|---|---|
| `pi` | `qwen3:1.7b` | `gemma3:1b` | `embeddinggemma` | 8 GB RAM, SSD |
| `mini` | `qwen3:4b` | `gemma3:4b` | `embeddinggemma` | 16 GB RAM, NVMe |
| `workstation` | `qwen3:8b` | `gemma3:12b` | `embeddinggemma` | 32 GB RAM, GPU optional |

Speech-to-text uses `faster-whisper` with `small.en` by default; speech output uses Piper. The model names and profile are configurable in `.env`. Model licenses must be reviewed for each commercial region and release.

The model binary weights are not inside the source ZIP because they are multi-gigabyte independently licensed artifacts. They are automatically installed on first boot. To manufacture hubs without customer-site downloads, run:

```bash
bash deployment/hub-installer/prepare-factory-bundle.sh mini
```

Store and distribute the resulting factory artifact under the applicable model licenses and integrity controls.

## Validate the installed hub

```bash
cd /opt/ujo
docker compose ps
docker compose logs --tail=200 ujo-core
docker compose logs --tail=200 ollama-init
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:11434/api/tags
```

Sign in locally, then call the authenticated AI status route from the UI. Confirm that:

- `ujo-core`, Mosquitto, Ollama, local STT and local TTS are healthy;
- the assistant alias exists;
- the database persists after a reboot;
- a backup can be restored;
- no service except the web hub and TLS MQTT broker is exposed on the LAN;
- Ollama, SQLite, Piper, Whisper and Home Assistant are not public internet endpoints.

## Hardware onboarding order

1. Keep all relays disconnected from mains and actuators.
2. Generate the node credentials on the installed hub: `sudo /opt/ujo/deployment/hub-installer/provision-node.sh ujo-room-01`. This creates a unique HMAC key and per-node MQTT username/password with topic ACLs.
3. Copy the generated values once into the board's private `config.h`, include the MQTT CA, then delete or archive the provisioning file securely.
4. Flash the matching firmware profile.
5. Verify TLS connection, topic isolation, signed telemetry, replay rejection and stale-command rejection.
6. Provision the node in the Ujo UI with the minimum allowed action list.
7. Bind a virtual test device and confirm command acknowledgement.
8. Only then connect an opto-isolated low-voltage test relay.
9. Complete the hardware-in-the-loop matrix before a qualified installer connects certified contactors or access hardware.

## Offline test

After commissioning:

1. Disconnect the internet while keeping the router/LAN powered.
2. Verify dashboard control, MQTT, local voice, local AI, automations and Home Assistant still work.
3. Power off the router and connect through the hub's recovery/local access method where configured.
4. Confirm no unsafe action occurs when the hub, broker, node or sensor becomes unavailable.
5. Restore the network and verify state reconciliation rather than assumed success.

## Updating

The repository contains an OTA/control-plane design, not a certified unattended retail updater. Until signed A/B images, rollback and release rings are implemented and tested, perform updates manually, keep a full rollback image and back up `/var/lib/docker/volumes` plus `/opt/ujo/.env` and private certificates securely.
