import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { HABridge } from './ha_bridge';

// --- CONFIGURATION ---
const PORT = 3000;
const DB_PATH = process.env.DATABASE_URL || 'ujo_os.db';

// --- HOME ASSISTANT BRIDGE ---
const haBridge = new HABridge({
  url: process.env.HA_URL || 'http://localhost:8123',
  token: process.env.HA_TOKEN || 'dummy_token'
});

// --- DATABASE SETUP ---
let db: Database;

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

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      state TEXT,
      status TEXT,
      power_usage REAL DEFAULT 0
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
    await db.exec('ALTER TABLE devices ADD COLUMN power_usage REAL DEFAULT 0');
  } catch (e) { /* ignore if already exists */ }

  try {
    await db.exec("ALTER TABLE alerts ADD COLUMN type TEXT DEFAULT 'anomaly'");
  } catch (e) { /* ignore if already exists */ }

  // Initial Seed
  const deviceCount = await db.get('SELECT COUNT(*) as count FROM devices');
  if (deviceCount?.count === 0) {
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage) VALUES ('light_1', 'Living Room Light', 'light', 'off', 'online', 0)");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage) VALUES ('lock_1', 'Front Door Lock', 'lock', 'locked', 'online', 0)");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage) VALUES ('fridge_1', 'Kitchen Fridge', 'appliance', 'normal', 'online', 85)");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage) VALUES ('thermostat_1', 'Main Thermostat', 'climate', '21°C', 'online', 450)");
    await db.run("INSERT INTO devices (id, name, type, state, status, power_usage) VALUES ('gas_sensor', 'Kitchen Gas', 'sensor', '92%', 'online', 0)");
  }

  const modeExists = await db.get("SELECT value FROM system_config WHERE key = 'mode'");
  if (!modeExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('mode', 'Standard')");
  }

  const locationExists = await db.get("SELECT value FROM system_config WHERE key = 'location'");
  if (!locationExists) {
    await db.run("INSERT INTO system_config (key, value) VALUES ('location', 'Home')");
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
    const alerts = await db.all('SELECT * FROM alerts WHERE confirmed = 0');
    const accessProfiles = await db.all('SELECT * FROM access_profiles');
    
    // Synthetic Energy Data
    const energy = {
      grid: Math.random() > 0.3 ? 'Connected' : 'Failing',
      voltage: 228, // V
      status: 'Stable',
      battery: 88,
      solar: 1.2, // kW
      forecast: 'Overcast Tomorrow'
    };

    return { devices, mode: mode?.value, location: location?.value, alerts, energy, accessProfiles };
  }

  async updateDevice(id: string, state: string) {
    await db.run('UPDATE devices SET state = ? WHERE id = ?', [state, id]);
  }

  async setMode(mode: string) {
    await db.run("UPDATE system_config SET value = ? WHERE key = 'mode'", [mode]);
  }

  async setLocation(location: string) {
    await db.run("UPDATE system_config SET value = ? WHERE key = 'location'", [location]);
  }

  async triggerAnomaly(title: string, message: string, severity: string, type: string = 'anomaly') {
    const id = `alert_${Date.now()}`;
    await db.run('INSERT INTO alerts (id, title, message, severity, type) VALUES (?, ?, ?, ?, ?)', [id, title, message, severity, type]);
    return id;
  }

  async confirmAlert(id: string, action: 'Confirm' | 'Ignore') {
    await db.run('UPDATE alerts SET confirmed = 1 WHERE id = ?', [id]);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ujo OS Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
