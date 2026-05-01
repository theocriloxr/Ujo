# Ujo OS: Comprehensive System Documentation

## Project Overview
**Ujo OS** is a sophisticated, full-stack Smart Home Operating System designed for privacy, efficiency, and proactive intelligence. It integrates local hardware control, AI-driven assistant capabilities, energy management, and advanced security protocols.

---

## Technical Stack
- **Frontend**: React 19, TypeScript, Vite.
- **Backend**: Node.js, Express, Socket.io (for real-time events).
- **Database**: SQLite (local persistence).
- **AI/ML**: Google Gemini (Flash 3.1) for Natural Language Processing and Text-to-Speech (TTS).
- **Styling**: Tailwind CSS with Framer Motion (for animations).
- **Icons**: Lucide React.
- **Data Visualization**: Recharts (for energy and voltage tracking).

---

## Core File Structure

### Backend Entry Point (`/server.ts`)
- **What it does**: Handles the Express API, Socket.io server, and database operations.
- **How it works**: 
  - Initializes a local SQLite database (`ujo_os.db`) with tables for devices, configurations, alerts, and access profiles.
  - Manages a **StateManager** class that centralizes the logic for device state updates, energy load shedding, and duress protocols.
  - Hosts the REST API for state fetching, NLP parsing, and simulation triggers.
  - Integrates with the `HABridge` for Home Assistant synchronization.

### Home Assistant Bridge (`/ha_bridge.ts`)
- **What it does**: Provides a prototype interface to communicate with a local Home Assistant instance.
- **How it works**: Uses WebSockets to connect to the Home Assistant API, allowing Ujo OS to act as a unified control plane for multiple ecosystems.

### Frontend Application (`/src/App.tsx`)
- **What it does**: The user interface for the system.
- **How it works**:
  - Connects to the server via WebSockets for instant state updates (e.g., when a device state changes or an anomaly is detected).
  - Uses the **@google/genai SDK** directly on the client for natural voice synthesis (AI TTS).
  - Implements a "Bento Grid" dashboard for intuitive control.
  - Contains advanced sub-modules like the **Security Keypad**, **Predictive Energy Charts**, and **Spatial Presence Logs**.

---

## Key System Features

### 1. AI Assistant (Ujo)
- **Use**: Natural language interaction with the home.
- **Implementation**: Frontend uses Gemini Flash to take user speech/text, while the backend parses intents (multi-intent support) to execute commands like "Turn on lights and lock the door."
- **Natural Voice**: Uses `gemini-3.1-flash-tts-preview` for human-like auditory feedback, with custom personas like *Onyx* (deep/calm) and *Jarvis* (British/technical).

### 2. Grid Guardian (Energy Management)
- **Use**: Protects battery life during power outages (Inverter mode).
- **Implementation**: Automatically detects when the power source switches. When on 'Inverter', it performs **Automatic Load Shedding**, shutting down "Heavy" appliances (ACs, Water Pumps) while keeping "Essential" devices (Lights, Fridge, Security) powered.

### 3. Duress Protocol (Silent Security)
- **Use**: Protects residents during forced entries.
- **Implementation**: The door lock accepts two PINs:
  - **Normal PIN (1234)**: Unlocks the door normally.
  - **Duress PIN (9999)**: Unlocks the door but silently flags the system as "Duress Active," triggering critical security alerts without notifying the intruder.

### 4. Domestic Staff Access Control
- **Use**: Manages temporary access for cleaners or maintenance staff.
- **Implementation**: Assigns time-and-day-based profiles (e.g., "Access allowed only on Tuesdays 10:00 - 14:00"). Access attempts outside these windows trigger unauthorized access alerts.

### 5. Proactive Anomaly Detection (HITL)
- **Use**: Predicts maintenance needs and security breaches.
- **Implementation**: The system monitors device power signatures (e.g., Fridge compressor spikes) and environmental sensors (CO2 levels). It uses **Human-in-the-Lopp (HITL)** logic, where critical actions (like shutting down a failing appliance) require user confirmation via a persistent alert system.

### 6. Spatial Presence & Ghosting Resolution
- **Use**: Resolves sensor confusion in multi-user environments.
- **Implementation**: Simulates sensor fusion between mmWave radar and local vision (ESP32-CAM embeddings). If radar "ghosts" (loses track of which person is which), the system uses voice-print biometrics and vision embeddings to "re-anchor" identity and keep controls locked to the correct user.

### 7. Guest Access (Secure QR)
- **Use**: Simple, secure access for visitors.
- **Implementation**: Generates a temporary, time-bound **JWT (JSON Web Token)** encoded into a scanable QR code, allowing guests limited control over specific rooms (e.g., the Living Room) for a short duration.

---

## Database Schema (Summary)
- `devices`: IDs, names, types, current states, and "Load Category" (Essential vs. Heavy).
- `system_config`: Global settings like current mode (Standard/Away), software version, and subscription status.
- `alerts`: Log of all detected anomalies with severity tiers (Low, Medium, High, Critical).
- `access_profiles`: Whitelist for domestic staff and temporary visitors.
- `voice_settings`: Customizable AI persona parameters (Pitch, Rate, Accent).

---

## Deployment & Updates
- **OTA Strategy**: System is designed to support Over-The-Air updates via a subscription-based "Ujo Cloud" module.
- **Containerization**: Deployable via Docker with provided `Dockerfile` and `docker-compose.yml`.
- **System Service**: Includes `ujo-os.service` configuration for Linux systemd integration.
