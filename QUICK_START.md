# Ujo quick start

## 1. Test the interface on Vercel

Use `docs/VERCEL_TEST_DEPLOYMENT.md`. Set `VITE_UJO_GATEWAY=true` and the four preview variables, deploy, leave Hub URL blank and log in. Preview mode is intentionally read-only.

After deployment, run:

```bash
UJO_TEST_URL=https://YOUR-DEPLOYMENT.vercel.app \
UJO_TEST_EMAIL=owner@example.com \
UJO_TEST_PASSWORD='your-preview-password' \
npm run smoke:vercel
```

## 2. Install the local hub with embedded AI

Use a Debian/Ubuntu mini PC or Pi and follow `docs/HUB_INSTALLATION_AND_TESTING.md`. The installer starts Ujo, TLS MQTT, Ollama, the selected assistant/vision/embedding models, faster-whisper and Piper.

After installation:

```bash
UJO_HUB_TEST_URL=http://ujo-home.local:3000 \
UJO_TEST_EMAIL=owner@example.com \
UJO_TEST_PASSWORD='your-hub-password' \
npm run smoke:hub
```

## 3. Connect Vercel to the hub

Create the outbound HTTPS tunnel, change Vercel to `UJO_GATEWAY_MODE=proxy`, set `UJO_REMOTE_HUB_URL`, redeploy, and repeat the Vercel smoke test.

## 4. Add equipment

Follow `docs/HARDWARE_DESIGN_AND_BOM.md` and `docs/END_TO_END_TEST_PLAN.md`. Begin with sensor-only and low-voltage bench equipment. Do not connect hobby boards directly to mains, locks, pumps, gates, generators, gas systems or life-safety equipment.
