# Ujo OS: Master Developer Guide

Welcome to the internal documentation for the Ujo OS "JARVIS" Prototype. This guide explains the neurological architecture of the system and how to extend it.

## 1. Project Structure
```text
/
├── server.ts             # The Brain: Node.js/Express server & SQLite logic
├── ujo_os.db             # The Memory: Persistent SQLite database
├── ha_bridge.ts          # The Peripheral: Logic for Home Assistant syncing
├── index.html            # The Entry Point
├── package.json          # The Blueprint: Dependency definitions
└── src/
    ├── App.tsx           # The Consciousness: Main UI and State logic
    ├── index.css         # The Aesthetic: Tailwind CSS layers & Bento styling
    └── main.tsx          # The Bootloader
```

## 2. Local Startup Instructions
1. **Repository Setup**: Ensure you have Node.js 20+ installed.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Database Initialization**: The system automatically creates `ujo_os.db` on the first run.
4. **Launch Dev Server**:
   ```bash
   npm run dev
   ```
5. **Access UI**: Open `http://localhost:3000` in your browser.

## 3. Logic Flow Walkthrough

### Dynamic Load Shedding (The Grid Guardian)
*   **Trigger**: When the user clicks "Inverter" in the UI, a POST request is sent to `/api/power-state`.
*   **Execution**: Inside `server.ts`, the `StateManager` receives the request. It immediately queries the database for all devices where `load_type = 'Heavy'`.
*   **Action**: It executes `UPDATE devices SET state = 'off' WHERE load_type = 'Heavy'`. This ensures that high-vampire loads are dropped before the inverter capsizes.

### Duress Protocol (Silent Security)
*   **Input**: The `Keypad` in `App.tsx` captures user input buffer.
*   **Processing**: On submission, `/api/security/unlock` checks the PIN against two hardcoded values.
*   **Duress Logic**: If `9999` is entered, the server returns a "Success" response so the UI looks normal (preventing the attacker from knowing an alarm was raised), but it internally flags `duress_active = 1` in the database.

## 4. How to Modify: Add a New Device
To add a new mock device (e.g., "Smart Curtains"):
1.  **Database**: In `server.ts`, find the `Initial Seed` section. Add:
    ```typescript
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage, load_type) VALUES ('curtain_1', 'Balcony Curtains', 'motor', 'closed', 'online', 15, 'Essential')");
    ```
2.  **UI Icon**: In `App.tsx`, update the `getIcon()` function in the `DeviceCard` component:
    ```typescript
    case 'motor': return <Link size={14} />; // or any Lucide icon
    ```
3.  **API Logic**: Update the `toggleDevice` function in `App.tsx` to handle the new `id` prefix:
    ```typescript
    else if (id.startsWith('curtain')) nextState = currentState === 'open' ? 'closed' : 'open';
    ```

## 5. Deployment Hardware Requirements
*   **Core**: Raspberry Pi 5 (8GB Recommended).
*   **Storage**: NVMe SSD (faster SQLite writes) or High Endurance SD Card.
*   **Zigbee**: Sonoff Zigbee 3.0 USB Dongle.
*   **Voice**: ESP32-S3-BOX-3 distributed nodes.
