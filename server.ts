import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ProactiveEngine } from './src/services/ProactiveEngine.ts';
import { TranslatorService } from './src/services/TranslatorService.ts';
import { setupMQTT } from './src/services/mqtt_handler.ts';
import { startSimulation } from './virtual_house.ts';
import { HABridge } from './ha_bridge.ts';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';

// --- CONFIGURATION ---
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';

// --- ENTERPRISE HUB SERVICES ---
const prisma = new PrismaClient();
const proactiveEngine = new ProactiveEngine(prisma);
const translator = new TranslatorService();

const haBridge = new HABridge({
  url: process.env.HA_URL || 'http://localhost:8123',
  token: process.env.HA_TOKEN || 'dummy_token'
});

let io: Server;

async function seedData() {
  // 1. Initial System Configuration
  await prisma.systemConfig.upsert({
    where: { id: 'GLOBAL' },
    update: {},
    create: {
      id: 'GLOBAL',
      mode: 'STANDARD',
      powerSource: 'MAINS',
      autoShedding: true
    }
  });

  // Check if we have devices
  const count = await prisma.device.count();
  if (count === 0) {
    await prisma.device.createMany({
      data: [
        { id: 'light_1', name: 'Living Room Light', type: 'light', state: 'off', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false },
        { id: 'lock_1', name: 'Front Door Lock', type: 'lock', state: 'locked', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false },
        { id: 'fridge_1', name: 'Kitchen Fridge', type: 'appliance', state: 'normal', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false, powerUsage: 85 },
        { id: 'ac_1', name: 'Master Bedroom AC', type: 'climate', state: 'off', status: 'ONLINE', category: 'HEAVY', isSheddable: true, powerUsage: 1500 },
        { id: 'pump_1', name: 'Borehole Pump', type: 'appliance', state: 'off', status: 'ONLINE', category: 'HEAVY', isSheddable: true, powerUsage: 1200 },
        { id: 'gas_sensor', name: 'Kitchen Gas', type: 'sensor', state: '92%', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false }
      ]
    });
  }

  const profileCount = await prisma.accessProfile.count();
  if (profileCount === 0) {
    await prisma.accessProfile.create({
      data: {
        id: 'staff_1',
        name: 'Abike (Cleaner)',
        role: 'STAFF',
        pinHash: 'dummy_hash', // In production this would be a bcrypt hash
        scheduleRaw: JSON.stringify({
          days: 'Tuesday, Thursday',
          start_time: '10:00',
          end_time: '14:00'
        })
      }
    });
  }
}

// --- STATE MANAGER (Enterprise Version) ---
class StateManager {
  async getStates() {
    const devices = await prisma.device.findMany();
    const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    const alerts = await prisma.alert.findMany({ where: { acknowledged: false } });
    const profiles = await prisma.accessProfile.findMany();
    
    // In a real InfluxDB environment, this would be a time-series query
    const energy = {
      grid: config?.powerSource === 'MAINS' ? 'Connected' : 'Failing',
      source: config?.powerSource || 'MAINS',
      voltage: config?.powerSource === 'MAINS' ? 228 : (config?.powerSource === 'INVERTER' ? 220 : 0),
      status: config?.powerSource === 'MAINS' ? 'Stable' : 'Battery Optimal',
      battery: 88,
      solar: 1.2,
      forecast: 'Overcast Tomorrow'
    };

    return { 
      devices, 
      mode: config?.mode, 
      location: 'Home', // Mocked
      updateAvailable: false, // Mocked
      subscriptionActive: true, // Mocked
      powerSource: config?.powerSource,
      duressActive: config?.mode === 'DURESS_ACTIVE',
      assistantName: 'Ujo',
      alerts, 
      energy, 
      accessProfiles: profiles 
    };
  }


  // --- SPATIAL LOCATOR: Find My Phone ---
  async findPhone() {
    // Check if phone is "online" (mocked check)
    const isPhoneOnline = Math.random() > 0.3; // 70% chance online for demo

    if (isPhoneOnline) {
      const triangulation = [
        { room: 'Living Room', rssi: -65, status: 'Weak' },
        { room: 'Kitchen', rssi: -42, status: 'Strong' },
        { room: 'Bedroom', rssi: -71, status: 'Very Weak' },
      ];
      
      const strongest = triangulation.sort((a, b) => b.rssi - a.rssi)[0];
      
      await this.triggerAnomaly(
        'Spatial Locator Success',
        `Phone heartbeat detected. Strongest signal in ${strongest.room} (-42dBm). Sonar activated.`,
        'info',
        'system'
      );
      
      if (io) {
        io.emit('phone_sonar_active', { room: strongest.room });
      }
      return { success: true, room: strongest.room, battery: 88, status: 'ONLINE' };
    } else {
      // Scenario A/B: Dead or Out of House
      const isDeadInside = Math.random() > 0.5;
      const response = isDeadInside 
        ? { 
            success: true, 
            status: 'DEAD_INSIDE', 
            lastKnownRoom: 'Living Room', 
            lastBattery: 1, 
            timestamp: '16:12',
            message: "Phone battery dropped to 1% at 4:12 PM. Its last known location was near the Living Room couch." 
          }
        : { 
            success: true, 
            status: 'OFF_SITE', 
            lastGeofenceExit: '08:45',
            message: "Phone is not within the home network. It was last registered leaving the geofence at 8:45 AM." 
          };

      await this.triggerAnomaly(
        'Spatial Locator Fallback',
        response.message,
        'medium',
        'system'
      );

      return response;
    }
  }

  // --- LAZARUS REBOOT ---
  async lazarusReboot(deviceId: string) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return { success: false, message: 'Device not found' };

    // Simulate power cycle
    await prisma.device.update({ where: { id: deviceId }, data: { status: 'REBOOTING' } });
    await this.broadcastUpdate();

    setTimeout(async () => {
      await prisma.device.update({ where: { id: deviceId }, data: { status: 'ONLINE' } });
      await this.triggerAnomaly(
        'Lazarus Self-Heal',
        `Device ${device.name} was unresponsive. Autonomous power-cycle (3s) successful. Re-synced to BLE Mesh.`,
        'low',
        'system'
      );
      await this.broadcastUpdate();
    }, 3000);

    return { success: true };
  }

  async broadcastUpdate() {
    if (io) {
      const data = await this.getStates();
      io.emit('state_update', data);
    }
  }

  async updateDevice(id: string, state: string) {
    await prisma.device.update({
      where: { id },
      data: { state }
    });
    await this.broadcastUpdate();
  }

  async setMode(mode: string) {
    await prisma.systemConfig.update({
      where: { id: 'GLOBAL' },
      data: { mode }
    });
    await this.broadcastUpdate();
  }

  // --- GRID GUARDIAN: Load Shedding Logic ---
  async setPowerState(source: string) {
    const config = await prisma.systemConfig.update({
      where: { id: 'GLOBAL' },
      data: { powerSource: source }
    });
    
    if (source === 'INVERTER' && config.autoShedding) {
      // Automatic Load Shedding: Only kill sheddable heavies
      await prisma.device.updateMany({
        where: { 
          category: 'HEAVY',
          isSheddable: true 
        },
        data: { state: 'OFF' }
      });
      await this.triggerAnomaly(
        'Load Shedding Active',
        'Grid power lost. Switched to Inverter. Non-essential heavy appliances shut down autonomously.',
        'medium',
        'ENERGY'
      );
    }
    await this.broadcastUpdate();
  }

  // --- DURESS PROTOCOL ---
  async unlockWithPin(pin: string) {
    const NORMAL_PIN = '1234';
    const DURESS_PIN = '9999';

    if (pin === NORMAL_PIN) {
      await this.updateDevice('lock_1', 'unlocked');
      await prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { mode: 'STANDARD' } });
      return { success: true, message: 'Welcome. Door unlocked.' };
    } 
    
    if (pin === DURESS_PIN) {
      await this.updateDevice('lock_1', 'unlocked');
      await prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { mode: 'DURESS_ACTIVE' } });
      await this.triggerAnomaly(
        'Silent Duress Alert',
        'Duress code entered. Security protocols initiated silently.',
        'CRITICAL',
        'SECURITY'
      );
      return { success: true, message: 'Welcome. Door unlocked.' };
    }

    return { success: false, message: 'Invalid PIN' };
  }

  async triggerAnomaly(title: string, message: string, severity: string, type: string = 'anomaly') {
    const alert = await prisma.alert.create({
      data: {
        message: `${title}: ${message}`,
        severity,
        type
      }
    });
    await this.broadcastUpdate();
    return alert.id;
  }

  async confirmAlert(id: string, action: string) {
    await prisma.alert.update({
      where: { id },
      data: { acknowledged: true }
    });
    await this.broadcastUpdate();
    return { success: true, message: `Alert acknowledged.` };
  }

  async checkStaffAccess(staffId: string) {
    const profile = await prisma.accessProfile.findUnique({ where: { id: staffId } });
    if (!profile) return { allowed: false, reason: 'No profile found' };

    const schedule = JSON.parse(profile.scheduleRaw || '{}');
    const { days = '', start_time = '00:00', end_time = '23:59' } = schedule;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

    const isDayMatch = days.includes(currentDay);
    const isTimeMatch = currentTime >= start_time && currentTime <= end_time;

    if (isDayMatch && isTimeMatch) {
      await this.updateDevice('lock_1', 'unlocked');
      return { allowed: true, name: profile.name };
    }

    return { 
      allowed: false, 
      reason: `Access refused. Authorized for ${days} between ${start_time}-${end_time}.` 
    };
  }

  async setLocation(location: string) {
    // Mocked for enterprise version
    await this.broadcastUpdate();
  }

  async nlpParse(rawText: string, room?: string, securityFlags?: { voiceVerified: boolean, phonePresent: boolean }) {
    const text = rawText.toLowerCase();
    const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    const currentMode = config?.mode;

    const { voiceVerified = false, phonePresent = false } = securityFlags || {};

    let responses: string[] = [];
    let success = false;
    let vaultRequired = false;

    // Multi-intent splitter
    const commands = text.split(/ and | then |, /);

    for (const cmd of commands) {
      let cmdProcessed = false;

      // Room-Aware Logic
      let targetSuffix = '';
      if (room) {
        if (room.toLowerCase().includes('kitchen')) targetSuffix = 'Kitchen';
        if (room.toLowerCase().includes('living')) targetSuffix = 'Living Room';
        if (room.toLowerCase().includes('bedroom')) targetSuffix = 'Bedroom';
      }

      // TIER 1: ENVIRONMENT (Low Security - Voice Only OK)
      if (cmd.includes('light on') || cmd.includes('light off')) {
        const devices = await prisma.device.findMany({ where: { type: 'light' } });
        const target = devices.find(d => d.name.includes(targetSuffix)) || devices[0];
        if (target) {
          const newState = cmd.includes('on') ? 'on' : 'off';
          await this.updateDevice(target.id, newState);
          responses.push(`${target.name} ${newState === 'on' ? 'activated' : 'deactivated'}`);
          cmdProcessed = true;
        }
      } else if (cmd.includes('ac on') || cmd.includes('ac off')) {
         const devices = await prisma.device.findMany({ where: { type: 'climate' } });
         const target = devices.find(d => d.name.includes(targetSuffix)) || devices[0];
         if (target) {
           const newState = cmd.includes('on') ? 'on' : 'off';
           await this.updateDevice(target.id, newState);
           responses.push(`${target.name} ${newState === 'on' ? 'active' : 'idle'}`);
           cmdProcessed = true;
         }
      } 
      // TIER 2: VAULT (High Security - Phone or PIN Required)
      else if (cmd.includes('unlock') || cmd.includes('door open') || cmd.includes('gate') || cmd.includes('payment')) {
        if (!phonePresent && !voiceVerified) {
          responses.push("Security protocol violation. Authentication required.");
          vaultRequired = true;
        } else if (!phonePresent && voiceVerified) {
          responses.push("Security protocol requires phone verification for Vault features. Please use the physical keypad PIN override.");
          vaultRequired = true;
        } else {
          // Authorized
          if (cmd.includes('unlock') || cmd.includes('door')) {
             await this.updateDevice('lock_1', 'unlocked');
             responses.push("Door unlocked. Welcome home, Admin.");
          } else {
             responses.push("Action authorized. Dispatching request.");
          }
          cmdProcessed = true;
        }
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
      : "I parsed your input but no specific triggers were activated.";

    return { success, response, intents: commands.length, vaultRequired };
  }
}

const stateManager = new StateManager();

async function startServer() {
  await seedData();
  proactiveEngine.init();
  
  const app = express();
  const server = http.createServer(app);
  io = new Server(server, { cors: { origin: '*' } });

  // Initialize MQTT Bridge & Virtual House Simulation
  setupMQTT(io, prisma);
  if (process.env.NODE_ENV !== 'production') {
    console.log('🛠️  DEV MODE: Auto-starting Virtual House Simulator...');
    startSimulation();
  }

  await haBridge.connect();

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

  app.post('/api/intercom/translate', async (req, res) => {
    const { text, dialect } = req.body;
    const translated = await translator.translateToDialect(text, dialect);
    res.json({ translated });
  });

  app.post('/api/devices/:id/toggle-sheddable', async (req, res) => {
    const { id } = req.params;
    const device = await prisma.device.findUnique({ where: { id } });
    if (device) {
      const updated = await prisma.device.update({
        where: { id },
        data: { isSheddable: !device.isSheddable }
      });
      await stateManager.broadcastUpdate();
      return res.json({ success: true, isSheddable: updated.isSheddable });
    }
    res.status(404).json({ error: 'Device not found' });
  });

  app.post('/api/system/toggle-shedding', async (req, res) => {
    const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    if (config) {
      await prisma.systemConfig.update({
        where: { id: 'GLOBAL' },
        data: { autoShedding: !config.autoShedding }
      });
      await stateManager.broadcastUpdate();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Config not found' });
    }
  });

  // --- PHASE 3 ENDPOINTS ---

  // NLP Parse
  app.post('/api/nlp-parse', async (req, res) => {
    const { text, room, securityFlags } = req.body;
    const result = await stateManager.nlpParse(text, room, securityFlags);
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
    const haDevices = await haBridge.syncState();
    for (const dev of haDevices) {
      await prisma.device.upsert({
        where: { id: dev.id },
        update: { state: dev.state },
        create: { 
          id: dev.id, 
          name: dev.name, 
          type: 'ha_linked', 
          state: dev.state, 
          status: 'ONLINE' 
        }
      });
    }
    res.json({ success: true, synced: haDevices.length });
  });

  // Voice Settings Update
  app.post('/api/voice/settings', async (req, res) => {
    // Legacy support- in Prisma we'd have a VoiceSettings model
    res.json({ success: true });
  });

  // OVER-THE-AIR (OTA) UPDATE MANAGER
  app.post('/api/system/check-update', async (req, res) => {
    await stateManager.triggerAnomaly(
      'System-Wide OTA Update Ready',
      'Ujo OS V2.1.0 & Mobile App V1.2.0 are ready. Install updates now?',
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

  // --- ECOSYSTEM ENDPOINTS ---
  
  app.get('/api/network/p2p-check', (req, res) => {
    // Detect if "Local" by checking IP or a specific header
    const isLocal = req.query.local === 'true';
    res.json({ local: isLocal, latency: isLocal ? '0ms' : '240ms' });
  });

  app.post('/api/system/onboarding/qr-handshake', (req, res) => {
    res.json({ success: true, message: 'Cryptographic link established. No cloud registration required.' });
  });

  app.post('/api/system/onboarding/voice-calibrate', (req, res) => {
    res.json({ success: true, message: 'Voice signature localized. User A identified as SuperAdmin.' });
  });

  app.post('/api/system/vault/auth', async (req, res) => {
     const { pin } = req.body;
     if (pin === '1234') { // Admin PIN
        await stateManager.triggerAnomaly('Vault Override Used', 'Manual PIN used for secure action authorization.', 'medium', 'security');
        res.json({ success: true });
     } else {
        res.status(403).json({ success: false, message: 'Invalid Admin PIN' });
     }
  });

  app.post('/api/system/find-phone', async (req, res) => {
    const result = await stateManager.findPhone();
    res.json({ success: true, ...result });
  });

  app.post('/api/devices/lazarus-reboot', async (req, res) => {
    const { id } = req.body;
    const result = await stateManager.lazarusReboot(id);
    res.json(result);
  });

  app.get('/api/test-env', (req, res) => {
    res.json({ val: process.env.GEMINI_API_KEY });
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
    res.json({ success: true, active: true });
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
