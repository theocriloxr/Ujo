# Ujo OS Deployment Guide (V1 Prototype)

This document outlines how to move the code from this environment onto your physical **Raspberry Pi 5** and **ESP32** hardware.

## 1. Hub Setup (Raspberry Pi 5)

### Prerequisites
- **OS:** Raspberry Pi OS (64-bit) Lite or Desktop.
- **Node.js:** Install Node v20+ (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`).
- **Home Assistant:** Install Home Assistant Supervised or Docker version.

### Installation Steps
1. **Transfer Code:** Download the project ZIP from AI Studio and move it to `/home/pi/ujo-os`.
2. **Install Dependencies:**
   ```bash
   cd /home/pi/ujo-os
   npm install
   ```
3. **Build Frontend:**
   ```bash
   npm run build
   ```
4. **Environment Variables:**
   Create a `.env` file in the root:
   ```env
   NODE_ENV=production
   HA_URL=ws://localhost:8123/api/websocket
   HA_TOKEN=YOUR_LONG_LIVED_ACCESS_TOKEN
   ```
5. **Launch:**
   ```bash
   # Run with tsx (included in devDependencies)
   npx tsx server.ts
   ```

## 2. Hardware Mapping

### Zigbee Integration
- Plug your **Sonoff Zigbee 3.0 Dongle** into a USB 2.0 port (use an extension cable to avoid interference).
- In Home Assistant, add the **Zigbee Home Automation (ZHA)** integration.
- Pair your Tuya Plugs and Aqara sensors. The `server.ts` logic will automatically pick them up via the Home Assistant Bridge.

### Voice Nodes (ESP32-S3-BOX-3)
- Use **ESPHome** to flash your ESP32-S3 units.
- Configure them to use the `micro_speech` or `voice_assistant` components.
- Set the `api_server` to your Pi's static IP.

## 3. Files to Upload
| Component | Files Required | Target Hardware |
| :--- | :--- | :--- |
| **The Brain** | `server.ts`, `ha_bridge.ts`, `package.json` | Raspberry Pi 5 |
| **The Interface** | `dist/` (generated after `npm run build`) | Raspberry Pi 5 |
| **Voice Firmware** | `esp32_voice_node.yaml` (ESPHome) | ESP32-S3-BOX-3 |

## 4. First Run Logic
When you first boot the system on your Pi:
1. Connect your phone to the same Wi-Fi.
2. Navigate to `http://<pi-ip-address>:3005`.
3. Ujo will detect it's the "First Run" and trigger the **Neural Link** greeting and hardware scan you see in the current prototype.
