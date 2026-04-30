import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { HABridge } from './ha_bridge.ts';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';

// --- CONFIGURATION ---
const PORT = 3000;
const DB_PATH = process.env.DATABASE_URL || 'ujo_os.db';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';

// --- HOME ASSISTANT BRIDGE ---
const haBridge = new HABridge({
  url: process.env.HA_URL || 'http://localhost:8123',
  token: process.env.HA_TOKEN || 'dummy_token'
});

// --- DATABASE SETUP ---
let db: Database;
let io: Server;

async function initDb() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS voice_settings (
      key TEXT PRIMARY KEY,
      persona TEXT DEFAULT 'JARVIS',
      pitch REAL DEFAULT 0.85,
      rate REAL DEFAULT 0.95,
      accent TEXT DEFAULT 'British'
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      state TEXT,
      status TEXT,
      power_usage REAL DEFAULT 0,
      load_type TEXT DEFAULT 'Essential' -- 'Essential' or 'Heavy'
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      title TEXT,
      message TEXT,
      severity TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed INTEGER DEFAULT 0,
      type TEXT DEFAULT 'anomaly' -- 'anomaly', 'vendor', 'energy', 'health'
    );

    CREATE TABLE IF NOT EXISTS access_profiles (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      start_time TEXT, -- HH:MM
      end_time TEXT,   -- HH:MM
      days TEXT        -- e.g. "Tuesday,Thursday"
    );

    CREATE TABLE IF NOT EXISTS energy_stats (
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      grid_status TEXT,
      battery_level INTEGER,
      solar_input REAL
    );
  `);

  // Migration for V2 columns
  try {
    await db.exec('ALTER TABLE devices ADD COLUMN load_type TEXT DEFAULT \'Essential\'');
  } catch (e) { /* ignore */ }

  try {
    await db.exec('ALTER TABLE devices ADD COLUMN power_usage REAL DEFAULT 0');
  } catch (e) { /* ignore if already exists */ }

  try {
    await db.exec("ALTER TABLE alerts ADD COLUMN type TEXT DEFAULT 'anomaly'");
  } catch (e) { /* ignore if already exists */ }

  // Initial Seed
  const deviceCount = await db.get('SELECT COUNT(*) as count FROM devices');
  if (deviceCount?.count === 0) {
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage, load_type) VALUES ('light_1', 'Living Room Light', 'light', 'off', 'online', 0, 'Essential')");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage, load_type) VALUES ('lock_1', 'Front Door Lock', 'lock', 'locked', 'online', 0, 'Essential')");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage, load_type) VALUES ('fridge_1', 'Kitchen Fridge', 'appliance', 'normal', 'online', 85, 'Essential')");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage, load_type) VALUES ('ac_1', 'Master Bedroom AC', 'climate', 'off', 'online', 1500, 'Heavy')");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage, load_type) VALUES ('pump_1', 'Borehole Pump', 'appliance', 'off', 'online', 1200, 'Heavy')");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage, load_type) VALUES ('gas_sensor', 'Kitchen Gas', 'sensor', '92%', 'online', 0, 'Essential')");
  }

  const modeExists = await db.get("SELECT value FROM system_config WHERE key = 'mode'");
  if (!modeExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('mode', 'Standard')");
  }

  const locationExists = await db.get("SELECT value FROM system_config WHERE key = 'location'");
  if (!locationExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('location', 'Home')");
  }

  const updateExists = await db.get("SELECT value FROM system_config WHERE key = 'software_update'");
  if (!updateExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('software_update', '0')");
  }

  const subExists = await db.get("SELECT value FROM system_config WHERE key = 'subscription_active'");
  if (!subExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('subscription_active', '0')");
  }

  const pwrExists = await db.get("SELECT value FROM system_config WHERE key = 'power_source'");
  if (!pwrExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('power_source', 'Grid')");
  }

  const durExists = await db.get("SELECT value FROM system_config WHERE key = 'duress_active'");
  if (!durExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('duress_active', '0')");
  }

  const asstNameExists = await db.get("SELECT value FROM system_config WHERE key = 'assistant_name'");
  if (!asstNameExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('assistant_name', 'Ujo')");
  }

  const voiceExists = await db.get("SELECT persona FROM voice_settings LIMIT 1");
  if (!voiceExists) {
    await db.run("INSERT INTO voice_settings (key, persona, pitch, rate, accent) VALUES ('current', 'JARVIS', 0.8, 0.95, 'British accent personality')");
  }

  const accessCount = await db.get('SELECT COUNT(*) as count FROM access_profiles');
  if (accessCount?.count === 0) {
    await db.run("INSERT INTO access_profiles (id, name, role, start_time, end_time, days) VALUES ('staff_1', 'Cleaner (Abike)', 'Domestic Staff', '10:00', '14:00', 'Tuesday')");
  }

  console.log('Database initialized.');
}

// --- STATE MANAGER ---
class StateManager {
  async getStates() {
    const devices = await db.all('SELECT * FROM devices');
    const mode = await db.get("SELECT value FROM system_config WHERE key = 'mode'");
    const location = await db.get("SELECT value FROM system_config WHERE key = 'location'");
    const updateAvailable = await db.get("SELECT value FROM system_config WHERE key = 'software_update'");
    const subscription = await db.get("SELECT value FROM system_config WHERE key = 'subscription_active'");
    const powerSource = await db.get("SELECT value FROM system_config WHERE key = 'power_source'");
    const duressActive = await db.get("SELECT value FROM system_config WHERE key = 'duress_active'");
    const assistantName = await db.get("SELECT value FROM system_config WHERE key = 'assistant_name'");
    const voice = await db.get("SELECT * FROM voice_settings WHERE key = 'current'");
    const alerts = await db.all('SELECT * FROM alerts WHERE confirmed = 0');
    const accessProfiles = await db.all('SELECT * FROM access_profiles');
    
    // Synthetic Energy Data
    const energy = {
      grid: powerSource?.value === 'Grid' ? 'Connected' : 'Failing',
      source: powerSource?.value || 'Grid',
      voltage: powerSource?.value === 'Grid' ? 228 : (powerSource?.value === 'Inverter' ? 220 : 0),
      status: powerSource?.value === 'Grid' ? 'Stable' : 'Battery Optimal',
      battery: 88,
      solar: 1.2, // kW
      forecast: 'Overcast Tomorrow'
    };

    return { 
      devices, 
      mode: mode?.value, 
      location: location?.value, 
      updateAvailable: updateAvailable?.value === '1',
      subscriptionActive: subscription?.value === '1',
      powerSource: powerSource?.value,
      duressActive: duressActive?.value === '1',
      assistantName: assistantName?.value || 'Ujo',
      voice,
      alerts, 
      energy, 
      accessProfiles 
    };
  }

  async broadcastUpdate() {
    if (io) {
      const data = await this.getStates();
      io.emit('state_update', data);
    }
  }

  async updateDevice(id: string, state: string) {
    await db.run('UPDATE devices SET state = ? WHERE id = ?', [state, id]);
    await this.broadcastUpdate();
  }

  async setMode(mode: string) {
    await db.run("UPDATE system_config SET value = ? WHERE key = 'mode'", [mode]);
    await this.broadcastUpdate();
  }

  // --- GRID GUARDIAN: Load Shedding Logic ---
  async setPowerState(source: 'Grid' | 'Inverter' | 'Generator') {
    await db.run("UPDATE system_config SET value = ? WHERE key = 'power_source'", [source]);
    
    if (source === 'Inverter') {
      // Automatic Load Shedding: Turn off "Heavy" devices to protect battery
      await db.run("UPDATE devices SET state = 'off' WHERE load_type = 'Heavy'");
      await this.triggerAnomaly(
        'Load Shedding Active',
        'Grid power lost. Switched to Inverter. Heavy appliances (AC, Pump) shut down to protect battery life.',
        'medium',
        'energy'
      );
    }
    await this.broadcastUpdate();
  }

  // --- DURESS PROTOCOL: Silent Security ---
  async unlockWithPin(pin: string) {
    const NORMAL_PIN = '1234';
    const DURESS_PIN = '9999';

    if (pin === NORMAL_PIN) {
      await this.updateDevice('lock_1', 'unlocked');
      await db.run("UPDATE system_config SET value = '0' WHERE key = 'duress_active'");
      return { success: true, message: 'Welcome. Door unlocked.' };
    } 
    
    if (pin === DURESS_PIN) {
      // Duress: Unlock door normally but trigger silent flag
      await this.updateDevice('lock_1', 'unlocked');
      await db.run("UPDATE system_config SET value = '1' WHERE key = 'duress_active'");
      
      await this.triggerAnomaly(
        'Silent Duress Alert',
        'Duress code entered at Front Door. Security protocols initiated silently.',
        'critical',
        'anomaly'
      );
      
      return { success: true, message: 'Welcome. Door unlocked.' }; // UI remains "normal"
    }

    return { success: false, message: 'Invalid PIN' };
  }

  async setLocation(location: string) {
    await db.run("UPDATE system_config SET value = ? WHERE key = 'location'", [location]);
  }

  async triggerAnomaly(title: string, message: string, severity: string, type: string = 'anomaly') {
    const id = `alert_${Date.now()}`;
    await db.run('INSERT INTO alerts (id, title, message, severity, type) VALUES (?, ?, ?, ?, ?)', [id, title, message, severity, type]);
    await this.broadcastUpdate();
    return id;
  }

  async confirmAlert(id: string, action: 'Confirm' | 'Ignore') {
    await db.run('UPDATE alerts SET confirmed = 1 WHERE id = ?', [id]);
    await this.broadcastUpdate();
    return { success: true, message: `Alert ${id} was ${action.toLowerCase()}ed.` };
  }

  async checkStaffAccess(staffId: string) {
    const profile = await db.get('SELECT * FROM access_profiles WHERE id = ?', [staffId]);
    if (!profile) return { allowed: false, reason: 'No profile found' };

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

    const isDayMatch = profile.days.includes(currentDay);
    const isTimeMatch = currentTime >= profile.start_time && currentTime <= profile.end_time;

    if (isDayMatch && isTimeMatch) {
      await this.updateDevice('lock_1', 'unlocked');
      return { allowed: true, name: profile.name };
    }

    return { 
      allowed: false, 
      reason: `Access refused. Authorized for ${profile.days} between ${profile.start_time}-${profile.end_time}.` 
    };
  }

  async nlpParse(rawText: string) {
    const text = rawText.toLowerCase();
    const modeData = await db.get("SELECT value FROM system_config WHERE key = 'mode'");
    const currentMode = modeData?.value;

    let intents = [];
    let responses: string[] = [];
    let success = false;

    // Multi-intent splitter
    const commands = text.split(/ and | then |, /);

    for (const cmd of commands) {
      let cmdProcessed = false;

      if (cmd.includes('light on')) {
        await this.updateDevice('light_1', 'on');
        responses.push("Light activated");
        cmdProcessed = true;
      } else if (cmd.includes('light off')) {
        await this.updateDevice('light_1', 'off');
        responses.push("Light deactivated");
        cmdProcessed = true;
      } else if (cmd.includes('lock door') || cmd.includes('door lock')) {
        await this.updateDevice('lock_1', 'locked');
        responses.push("Door secured");
        cmdProcessed = true;
      } else if (cmd.includes('unlock') || cmd.includes('door open')) {
        // CONFLICT CHECK: Can't unlock in Away mode via voice alone (Security Priority)
        if (currentMode === 'Away') {
          responses.push("Refused. Cannot unlock door while in Away Mode.");
        } else {
          await this.updateDevice('lock_1', 'unlocked');
          responses.push("Door unlocked");
        }
        cmdProcessed = true;
      } else if (cmd.includes('energy') || cmd.includes('weather')) {
        responses.push("Tomorrow will be overcast. Run high-vampire loads today.");
        cmdProcessed = true;
      } else if (cmd.includes('diesel')) {
        responses.push("Diesel at 15%. Queued order to Ade Gas.");
        cmdProcessed = true;
      }

      if (cmdProcessed) success = true;
    }

    const response = responses.length > 0 
      ? responses.join(". ") + "." 
      : "I parsed your input but no specific hardware triggers were found.";

    return { success, response, intents: commands.length };
  }
}

const stateManager = new StateManager();

async function startServer() {
  await initDb();
  await haBridge.connect();
  
  const app = express();
  const server = http.createServer(app);
  io = new Server(server, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
  });

  app.use(cors());
  app.use(express.json());

  // --- API ENDPOINTS ---

  // Fetch all states
  app.get('/api/states', async (req, res) => {
    console.log('GET /api/states hit');
    try {
      const data = await stateManager.getStates();
      res.json(data);
    } catch (error) {
      console.error('States fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch states' });
    }
  });

  // Mode Switcher
  app.post('/api/mode', async (req, res) => {
    const { mode } = req.body;
    if (!['Standard', 'Sleep', 'Manual Override'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    await stateManager.setMode(mode);
    res.json({ success: true, mode });
  });

  // Trigger Mock HITL Anomaly
  app.post('/api/anomaly', async (req, res) => {
    const id = await stateManager.triggerAnomaly(
      'Fridge Power Spike',
      'Unusual power draw detected in Kitchen Fridge. Potential compressor failure. Shut down appliance?',
      'high'
    );
    res.json({ success: true, id });
  });

  // Confirm Alert (HITL)
  app.post('/api/hitl/confirm', async (req, res) => {
    const { id, action } = req.body;
    const result = await stateManager.confirmAlert(id, action);
    res.json(result);
  });

  // Toggle Device State (Helper for Phase 2)
  app.post('/api/device/toggle', async (req, res) => {
    const { id, state } = req.body;
    await stateManager.updateDevice(id, state);
    res.json({ success: true });
  });

  app.post('/api/system/assistant-name', async (req, res) => {
    const { name } = req.body;
    await db.run("UPDATE system_config SET value = ? WHERE key = 'assistant_name'", [name]);
    await stateManager.broadcastUpdate();
    res.json({ success: true });
  });

  // --- PHASE 3 ENDPOINTS ---

  // NLP Parse
  app.post('/api/nlp-parse', async (req, res) => {
    const { text } = req.body;
    const result = await stateManager.nlpParse(text);
    res.json(result);
  });

  // Location Switcher (Mock GPS)
  app.post('/api/location', async (req, res) => {
    const { location } = req.body;
    await stateManager.setLocation(location);
    res.json({ success: true, location });
  });

  // Motion Detection Trigger (Fly vs Human Logic)
  app.post('/api/motion', async (req, res) => {
    const data = await stateManager.getStates();
    if (data.location === 'Away') {
      const id = await stateManager.triggerAnomaly(
        'Unexpected Motion',
        'Motion detected in Living Room while status is "Away". Intruders likely. Raise alarm?',
        'critical'
      );
      res.json({ success: true, anomaly: true, id });
    } else {
      // Normal behavior: turn on light
      await stateManager.updateDevice('light_1', 'on');
      res.json({ success: true, anomaly: false, message: 'Welcome home. Light on.' });
    }
  });

  // --- PHASE 4 V2 ENDPOINTS ---

  // Simulate Staff Access Attempt
  app.post('/api/access/staff-auth', async (req, res) => {
    const { id } = req.body;
    const result = await stateManager.checkStaffAccess(id);
    if (result.allowed) {
      res.json({ success: true, message: `Access granted for ${result.name}. Door unlocked.` });
    } else {
      const alertId = await stateManager.triggerAnomaly(
        'Unauthorized Access',
        `Staff access denied for Abike. ${result.reason}`,
        'high',
        'anomaly'
      );
      res.status(403).json({ success: false, message: result.reason, alertId });
    }
  });

  // Health / Sleep Monitoring Simulate
  app.post('/api/health/co2-trigger', async (req, res) => {
    const id = await stateManager.triggerAnomaly(
      'Air Quality Warning',
      'CO2 levels in Master Bedroom have spiked to 1200ppm. Activating AC fan to cycle fresh air.',
      'low',
      'health'
    );
    res.json({ success: true, id });
  });

  // HA Status
  app.get('/api/ha/status', async (req, res) => {
    console.log('GET /api/ha/status hit');
    const status = await haBridge.getStatus();
    res.json(status);
  });

  // HA Sync
  app.post('/api/ha/sync', async (req, res) => {
    const devices = await haBridge.syncState();
    for (const dev of devices) {
      const existing = await db.get('SELECT id FROM devices WHERE id = ?', [dev.id]);
      if (existing) {
        await db.run('UPDATE devices SET state = ? WHERE id = ?', [dev.state, dev.id]);
      } else {
        await db.run('INSERT INTO devices (id, name, type, state, status) VALUES (?, ?, ?, ?, ?)', [dev.id, dev.name, 'ha_linked', dev.state, 'online']);
      }
    }
    res.json({ success: true, synced: devices.length });
  });

  // Voice Settings Update
  app.post('/api/voice/settings', async (req, res) => {
    const { persona, pitch, rate } = req.body;
    await db.run('UPDATE voice_settings SET persona = ?, pitch = ?, rate = ? WHERE key = \'current\'', [persona, pitch, rate]);
    res.json({ success: true });
  });

  // OVER-THE-AIR (OTA) UPDATE MANAGER
  app.post('/api/system/check-update', async (req, res) => {
    const sub = await db.get("SELECT value FROM system_config WHERE key = 'subscription_active'");
    if (sub?.value !== '1') {
      return res.status(403).json({ success: false, message: 'Cloud updates require an active Ujo SaaS subscription.' });
    }

    await db.run("UPDATE system_config SET value = '1' WHERE key = 'software_update'");
    await stateManager.triggerAnomaly(
      'System-Wide OTA Update Ready',
      'Ujo OS V2.1.0 & Mobile App V1.2.0 are ready. Edge vision models have been downloaded. Install updates now?',
      'medium',
      'system'
    );
    res.json({ success: true });
  });

  // WHATSAPP VENDOR DISPATCH
  app.post('/api/vendor/dispatch', async (req, res) => {
    const { vendorType } = req.body; // 'diesel' or 'water'
    // Simulated WhatsApp API call
    console.log(`[WHATSAPP API] Sending message to ${vendorType === 'diesel' ? process.env.VENDOR_DIESEL_CONTACT : '+local'}`);
    
    await stateManager.triggerAnomaly(
      'Vendor Auto-Dispatch',
      `WhatsApp message sent to local ${vendorType} vendor. Expect delivery shortly.`,
      'low',
      'vendor'
    );
    res.json({ success: true, message: `Dispatched ${vendorType} via WhatsApp Edge Module.` });
  });

  // GUEST QR CODE GENERATOR
  app.post('/api/security/guest-code', async (req, res) => {
    // Generate a temporary JWT for guest access to the living room
    const token = jwt.sign({ role: 'guest', room: 'living_room', exp: Math.floor(Date.now() / 1000) + (60 * 60) }, JWT_SECRET);
    
    // Generate the URL that the guest scans
    const accessUrl = `http://ujo-home.local/guest?token=${token}`;
    const qrCodeImage = await QRCode.toDataURL(accessUrl);
    
    res.json({ success: true, url: accessUrl, qrCode: qrCodeImage });
  });

  // TEXT-TO-SPEECH (TTS) ENDPOINT
  // We use the cloud-based Google Gen AI (or potentially ElevenLabs/OpenAI) to give it a natural voice.
  app.post('/api/tts', async (req, res) => {
    const { text, persona } = req.body;
    try {
      if (process.env.ELEVENLABS_API_KEY) {
         // Placeholder for ElevenLabs integration
         console.log('Would call ElevenLabs API here');
      }

      // Defaulting to Google Gemini TTS as configured in the system
      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const voiceName = (persona?.toLowerCase() === 'onyx' || persona?.toLowerCase() === 'jarvis') ? 'Puck' : 'Kore'; 
      
      const ttsResp = await ai.models.generateContent({
         model: "gemini-3.1-flash-tts-preview",
         contents: [{ parts: [{ text }] }],
         config: {
           responseModalities: [Modality.AUDIO],
           speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName } }
           }
         }
      });
      
      const base64Audio = ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
         const audioBuffer = Buffer.from(base64Audio, 'base64');
         res.set('Content-Type', 'audio/wav');
         return res.send(audioBuffer);
      }
      res.status(500).json({ error: "Failed to parse TTS buffer" });
    } catch (err) {
      console.error('Cloud TTS Error:', err);
      res.status(500).json({ error: "TTS Generation Failed" });
    }
  });

  app.post('/api/system/simulate-tracking', async (req, res) => {
    // Spatial Ghosting Scenario Simulation
    io.emit('state-update'); // Ping client to refresh just in case
    
    const sendPulse = (msg: string, delay: number) => {
       setTimeout(() => io.emit('spatial-pulse', msg), delay);
    };

    sendPulse('[mmWave 60GHz]: User A detected in Kitchen. Confidence: 100%. Audio locked.', 500);
    sendPulse('[mmWave 60GHz]: User C enters Kitchen. Identity tracking split. Confidence: 50% each.', 3500);
    sendPulse('[Ghosting/Split detected]: User C walks to Hallway. Confidence below 90% threshold.', 6500);
    sendPulse('[Sticky Audio Protocol]: Micro-Doppler Gait mismatch. Audio retains in Kitchen.', 8500);
    
    // Frictionless Correction Simulation
    sendPulse('[Edge Vision ESP32-CAM]: Captured face. Local embedding match -> User C. Deleted frame.', 10500);
    sendPulse('[Sensor Fusion Override]: Radar ghosting resolved via vision. Audio locked to Kitchen for User A.', 12500);
    sendPulse('[Simulating Sensor Error]: Moving audio to Hallway arbitrarily.', 15500);
    sendPulse('User A: "Ujo, I\'m here."', 18000);
    sendPulse('[Spatial Re-anchoring Protocol]: Matched User A voice print via Kitchen mic array. Reversing move. Updating radar weights.', 20500);

    res.json({ success: true, message: 'Tracking override initiated' });
  });

  app.post('/api/system/simulate-coadmin', async (req, res) => {
    io.emit('spatial-pulse', 'Co-Admin Parity Conflict: "Lock house" (Husband) vs "Leave open" (Wife) received simultaneously.');
    setTimeout(() => {
      io.emit('spatial-pulse', 'Safety Pause Initiated: Cryptographic authority identical.');
    }, 2000);
    res.json({ success: true, message: 'I am receiving conflicting Admin commands. Please confirm the final decision.'});
  });

  // Toggle Subscription (Demo/Dev)
  app.post('/api/system/toggle-subscription', async (req, res) => {
    const current = await db.get("SELECT value FROM system_config WHERE key = 'subscription_active'");
    const nextValue = current?.value === '1' ? '0' : '1';
    await db.run("UPDATE system_config SET value = ? WHERE key = 'subscription_active'", [nextValue]);
    res.json({ success: true, active: nextValue === '1' });
  });

  // POWER SOURCE ENDPOINT (Grid Guardian)
  app.post('/api/power-state', async (req, res) => {
    const { source } = req.body;
    await stateManager.setPowerState(source);
    res.json({ success: true, source });
  });

  // SECURITY UNLOCK (Duress Logic)
  app.post('/api/security/unlock', async (req, res) => {
    const { pin } = req.body;
    const result = await stateManager.unlockWithPin(pin);
    res.json(result);
  });

  // PREDICTIVE ENGINE SIMULATOR
  app.post('/api/simulate-time', async (req, res) => {
    const id = await stateManager.triggerAnomaly(
      'Spoilage Warning',
      'Fridge ethylene gas spike detected. Tomatoes in drawer are likely spoiling. Add replacements to grocery list?',
      'medium',
      'health'
    );
    res.json({ success: true, id });
  });

  // IMPROVEMENT: Background Simulation (Every 30 seconds)
  setInterval(async () => {
    const chance = Math.random();
    if (chance > 0.95) { // 5% chance of a random anomaly
      await stateManager.triggerAnomaly(
        "Voltage Fluctuation", 
        "Unstable grid frequency detected. Stabilizing via Inverter...", 
        "medium", 
        "energy"
      );
    }
  }, 30000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ujo OS Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
