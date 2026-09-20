import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ProactiveEngine } from './src/services/ProactiveEngine.ts';
import { TranslatorService } from './src/services/TranslatorService.ts';
import { LocalVoiceService } from './src/services/LocalVoiceService.ts';
import { LocalSpeechService } from './src/services/LocalSpeechService.ts';
import { setupMQTT } from './src/services/mqtt_handler.ts';
import { startSimulation } from './virtual_house.ts';
import { HABridge } from './ha_bridge.ts';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { AttemptLimiter, assertProductionSecrets, hashCredential, hashPin, newSessionToken, safeEqualText, sessionTokenHash, verifyCredential, verifyPin } from './src/services/security.ts';
import { hubListenHost, isLoopbackAddress } from './src/services/bridgePolicy.ts';
import { createBridgeRouter } from './src/services/bridgeRouter.ts';
import { createIdentityRouter, loadIdentityTrust } from './src/services/identityRouter.ts';
import { OllamaService } from './src/services/OllamaService.ts';
import { evaluateProposedAction, isSensitiveNaturalLanguage } from './src/services/commandPolicy.ts';
import { estimateFreshness } from './src/services/FoodIntelligence.ts';
import { assessMaintenance } from './src/services/InfrastructureIntelligence.ts';
import { validateAutomationDefinition } from './src/services/AutomationPolicy.ts';
import { AutomationEngine } from './src/services/AutomationEngine.ts';
import { DeviceControlService } from './src/services/DeviceControlService.ts';
import { LocalAIRegistryService } from './src/services/LocalAIRegistryService.ts';
import { HardwareHttpAuthenticator } from './src/services/hardwareHttpAuth.ts';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// --- CONFIGURATION ---
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
assertProductionSecrets(process.env);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';
const OWNER_PIN = process.env.UJO_OWNER_PIN || '1234';
const DURESS_PIN = process.env.UJO_DURESS_PIN || '9999';
const STAFF_PIN = process.env.UJO_STAFF_PIN || '2468';
const pinLimiter = new AttemptLimiter(5, 60_000);
const loginLimiter = new AttemptLimiter(5, 15 * 60_000);
const allowedOrigins = (process.env.APP_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
const SIMULATION_ENABLED = process.env.UJO_ENABLE_SIMULATION === 'true' && process.env.NODE_ENV !== 'production';
const ALLOW_MANUAL_POWER_SOURCE = process.env.UJO_ALLOW_MANUAL_POWER_SOURCE === 'true';

// --- ENTERPRISE HUB SERVICES ---
const prisma = new PrismaClient();
const proactiveEngine = new ProactiveEngine(prisma);
const translator = new TranslatorService();
const localVoice = new LocalVoiceService();
const localSpeech = new LocalSpeechService();
const ollama = new OllamaService();
const automationEngine = new AutomationEngine(prisma);
const localAIRegistry = new LocalAIRegistryService();
const hardwareHttpAuth = new HardwareHttpAuthenticator();

const haBridge = new HABridge({
  url: process.env.HA_URL || 'http://localhost:8123',
  token: process.env.HA_TOKEN || 'dummy_token'
});

let io: Server;
let deviceControl: DeviceControlService | null = null;

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function purgeExpiredSnapshots(now = Date.now()): Promise<number> {
  const retentionDays = Math.max(1, Math.min(3650, Number(process.env.SNAPSHOT_RETENTION_DAYS || 30)));
  const cutoff = now - retentionDays * 86_400_000;
  const root = path.resolve(process.env.UJO_SNAPSHOT_DIR || '/app/data/snapshots');
  let deleted = 0;
  try {
    for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.jpg')) continue;
      const fullPath = path.join(root, entry.name);
      const stat = await fs.promises.stat(fullPath);
      if (stat.mtimeMs < cutoff) {
        await fs.promises.unlink(fullPath);
        deleted++;
      }
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn('[Snapshots] Retention cleanup failed:', error);
  }
  return deleted;
}

async function authenticateSessionToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.userSession.findUnique({ where: { tokenHash: sessionTokenHash(token) } });
  if (!session || session.revoked || session.expiresAt <= new Date()) return null;
  const user = await prisma.userAccount.findUnique({ where: { id: session.userId } });
  if (!user || user.disabled) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return { session, user };
}

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
      data: ([
        { id: 'light_1', name: 'Living Room Light', type: 'light', state: 'off', status: 'UNKNOWN', category: 'ESSENTIAL', isSheddable: false },
        { id: 'lock_1', name: 'Front Door Lock', type: 'lock', state: 'locked', status: 'UNKNOWN', category: 'ESSENTIAL', isSheddable: false },
        { id: 'fridge_1', name: 'Kitchen Fridge', type: 'appliance', state: 'normal', status: 'UNKNOWN', category: 'ESSENTIAL', isSheddable: false, powerUsage: 85 },
        { id: 'ac_1', name: 'Master Bedroom AC', type: 'climate', state: 'off', status: 'UNKNOWN', category: 'HEAVY', isSheddable: true, powerUsage: 1500 },
        { id: 'pump_1', name: 'Borehole Pump', type: 'appliance', state: 'off', status: 'UNKNOWN', category: 'HEAVY', isSheddable: true, powerUsage: 1200 },
        { id: 'gas_sensor', name: 'Kitchen Gas', type: 'sensor', state: 'unknown', status: 'UNKNOWN', category: 'ESSENTIAL', isSheddable: false }
      ] as any[]).map(device => ({
        ...device,
        controlProvider: SIMULATION_ENABLED ? 'SIMULATION' : 'UNBOUND',
        lastCommandStatus: 'IDLE'
      }))
    });
  }

  const profileCount = await prisma.accessProfile.count();
  if (profileCount === 0) {
    await prisma.accessProfile.create({
      data: {
        id: 'staff_1',
        name: 'Abike (Cleaner)',
        role: 'STAFF',
        pinHash: hashPin(STAFF_PIN),
        scheduleRaw: JSON.stringify({
          days: 'Tuesday, Thursday',
          start_time: '10:00',
          end_time: '14:00'
        })
      }
    });
  }

  await prisma.accessProfile.updateMany({
    where: { role: 'STAFF', pinHash: { not: { startsWith: 'scrypt$' } } },
    data: { pinHash: hashPin(STAFF_PIN) }
  });

  await prisma.accessProfile.upsert({
    where: { id: 'owner_primary' },
    update: { pinHash: hashPin(OWNER_PIN), role: 'OWNER' },
    create: { id: 'owner_primary', name: 'Primary Admin', role: 'OWNER', pinHash: hashPin(OWNER_PIN) }
  });
  await prisma.accessProfile.upsert({
    where: { id: 'duress_primary' },
    update: { pinHash: hashPin(DURESS_PIN), role: 'DURESS' },
    create: { id: 'duress_primary', name: 'Duress Profile', role: 'DURESS', pinHash: hashPin(DURESS_PIN) }
  });

  const adminEmail = (process.env.UJO_ADMIN_EMAIL || 'admin@ujo.local').trim().toLowerCase();
  const adminPassword = process.env.UJO_ADMIN_PASSWORD || 'ujo-development-password';
  await prisma.userAccount.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, displayName: 'Home Owner', role: 'OWNER', passwordHash: hashCredential(adminPassword) }
  });
}

// --- STATE MANAGER (Enterprise Version) ---
class StateManager {
  async getStates() {
    const devices = await prisma.device.findMany();
    const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    const alerts = await prisma.alert.findMany({ where: { acknowledged: false } });
    const profiles = await prisma.accessProfile.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        scheduleRaw: true,
        isTemporal: true,
        expiresAt: true
      }
    });
    const latestPower = await prisma.powerSnapshot.findFirst({ orderBy: { timestamp: 'desc' } });
    const voice = await prisma.voiceSettings.upsert({ where: { id: 'GLOBAL' }, update: {}, create: { id: 'GLOBAL' } });
    const energy = latestPower ? {
      grid: latestPower.source === 'MAINS' ? 'Connected' : 'Unavailable',
      source: latestPower.source,
      voltage: latestPower.voltage,
      status: latestPower.voltage >= 180 && latestPower.voltage <= 260 ? 'Stable' : 'Unsafe',
      battery: latestPower.batteryPct,
      solar: latestPower.solarWatts,
      totalWatts: latestPower.totalWatts,
      measuredAt: latestPower.timestamp,
      forecast: null
    } : {
      grid: 'Unknown', source: config?.powerSource || 'UNKNOWN', voltage: null, status: 'No telemetry',
      battery: null, solar: null, totalWatts: null, measuredAt: null, forecast: null
    };

    return {
      devices,
      mode: config?.mode,
      location: config?.location || 'Home',
      updateAvailable: false,
      subscriptionActive: false,
      subscriptionStatus: 'NOT_CONFIGURED',
      powerSource: latestPower?.source || config?.powerSource,
      duressActive: config?.mode === 'DURESS_ACTIVE',
      assistantName: voice.persona,
      alerts: alerts.map(alert => ({
        ...alert,
        title: alert.message.includes(':') ? alert.message.split(':', 1)[0] : alert.type,
        message: alert.message.includes(':') ? alert.message.slice(alert.message.indexOf(':') + 1).trim() : alert.message
      })),
      energy,
      accessProfiles: profiles,
      capabilities: {
        simulation: SIMULATION_ENABLED,
        manualPowerSource: ALLOW_MANUAL_POWER_SOURCE,
        homeAssistant: haBridge.isConfigured(),
        localVoice: true,
        hardwareApprovalRequired: true
      }
    };
  }

  // --- SPATIAL LOCATOR: Find My Phone ---
  async findPhone() {
    if (!SIMULATION_ENABLED) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'Phone location requires an enrolled mobile device publishing signed local presence/RSSI observations.'
      };
    }
    return { success: true, status: 'SIMULATION', room: 'Kitchen', message: 'Simulation-only location result.' };
  }

  // --- LAZARUS REBOOT ---
  async lazarusReboot(deviceId: string, actor = 'owner') {
    if (!deviceControl) throw new Error('Device control service is not ready.');
    const result = await deviceControl.requestReboot(deviceId, actor);
    await this.broadcastUpdate();
    return { success: true, ...result };
  }

  async broadcastUpdate() {
    if (io) {
      const data = await this.getStates();
      io.emit('state_update', data);
    }
  }
  async updateDevice(id: string, state: string, actor = 'authenticated-user', reason = 'Authenticated control request') {
    if (!deviceControl) throw new Error('Device control service is not ready.');
    const result = await deviceControl.control(id, state, actor, reason);
    await this.broadcastUpdate();
    return result;
  }

  async setMode(mode: string) {
    await prisma.systemConfig.update({
      where: { id: 'GLOBAL' },
      data: { mode }
    });
    await this.broadcastUpdate();
  }
  // --- GRID GUARDIAN: Load Shedding Logic ---
  async setPowerState(source: string, actor = 'power-telemetry') {
    if (!['MAINS', 'INVERTER', 'GENERATOR', 'SOLAR'].includes(source)) throw new Error('Invalid power source.');
    const config = await prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { powerSource: source } });
    const actions: Array<{ deviceId: string; status: string; error?: string }> = [];
    if (source === 'INVERTER' && config.autoShedding) {
      const devices = await prisma.device.findMany({ where: { category: 'HEAVY', isSheddable: true } });
      for (const device of devices) {
        try {
          const result = await this.updateDevice(device.id, 'off', actor, 'Deterministic load-shedding policy');
          actions.push({ deviceId: device.id, status: result.status });
        } catch (error) {
          actions.push({ deviceId: device.id, status: 'FAILED', error: error instanceof Error ? error.message : 'Control failed' });
        }
      }
      await this.triggerAnomaly(
        'Load Shedding Requested',
        `Backup power detected. ${actions.filter(item => item.status !== 'FAILED').length} control actions accepted; ${actions.filter(item => item.status === 'FAILED').length} need attention.`,
        actions.some(item => item.status === 'FAILED') ? 'HIGH' : 'MEDIUM',
        'ENERGY'
      );
    }
    await this.broadcastUpdate();
    return { source, actions };
  }

  // --- SECURITY LOGGING ---
  async logSecurityEvent(action: string, actor: string, status: 'SUCCESS' | 'FAILURE', metadata?: any) {
    try {
      await prisma.securityAudit.create({
        data: {
          action,
          actor,
          status,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });
      console.log(`[SECURITY AUDIT] ${action} by ${actor}: ${status}`);
    } catch (err) {
      console.error('Failed to log security event:', err);
    }
  }

  // --- DURESS PROTOCOL ---
  async unlockWithPin(pin: string) {
    const profiles = await prisma.accessProfile.findMany({
      where: { role: { in: ['OWNER', 'DURESS'] } }
    });
    const profile = profiles.find(candidate => verifyPin(pin, candidate.pinHash));

    if (profile?.role === 'OWNER') {
      if (!deviceControl) throw new Error('Device control service is not ready.');
      const command = await deviceControl.controlAccess('lock_1', 'unlocked', profile.id, 'Validated owner PIN access request');
      await this.broadcastUpdate();
      await prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { mode: 'STANDARD' } });
      await this.logSecurityEvent('PIN_ATTEMPT', 'Physical Keypad', 'SUCCESS', { type: 'NORMAL', commandStatus: command.status });
      return { success: true, status: command.status, message: command.status === 'COMPLETED' ? 'Welcome. Door unlocked.' : 'Identity verified. Unlock command accepted; waiting for the lock to report its state.' };
    } 
    
    if (profile?.role === 'DURESS') {
      if (!deviceControl) throw new Error('Device control service is not ready.');
      const command = await deviceControl.controlAccess('lock_1', 'unlocked', profile.id, 'Validated duress PIN access request');
      await this.broadcastUpdate();
      await prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { mode: 'DURESS_ACTIVE' } });
      await this.triggerAnomaly(
        'Silent Duress Alert',
        'Duress code entered. Security protocols initiated silently.',
        'CRITICAL',
        'SECURITY'
      );
      await this.logSecurityEvent('PIN_ATTEMPT', 'Physical Keypad', 'SUCCESS', { type: 'DURESS', commandStatus: command.status });
      return { success: true, status: command.status, message: command.status === 'COMPLETED' ? 'Welcome. Door unlocked.' : 'Welcome. Access request accepted.' };
    }

    await this.logSecurityEvent('PIN_ATTEMPT', 'Physical Keypad', 'FAILURE', { pin_entered: '****' });
    return { success: false, message: 'Invalid PIN' };
  }

  async verifyOwnerPin(pin: string) {
    const owners = await prisma.accessProfile.findMany({ where: { role: 'OWNER' } });
    return owners.some(owner => verifyPin(pin, owner.pinHash));
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

  async simulateMotion(room: string) {
    if (io) {
      io.emit('motion-detected', { room, timestamp: new Date() });
    }
    await this.logSecurityEvent('MOTION_DETECTED', 'Occupancy Sensor', 'SUCCESS', { room });
    console.log(`[MOTION] Simulated event in ${room}`);
  }

  async confirmAlert(id: string, action: string) {
    await prisma.alert.update({
      where: { id },
      data: { acknowledged: true }
    });
    await this.broadcastUpdate();
    return { success: true, message: `Alert acknowledged.` };
  }

  async checkStaffAccess(staffId: string, pin: string) {
    const profile = await prisma.accessProfile.findUnique({ where: { id: staffId } });
    if (!profile) return { allowed: false, reason: 'No profile found' };
    if (profile.role !== 'STAFF' || !verifyPin(pin, profile.pinHash)) {
      await this.logSecurityEvent('STAFF_AUTH', staffId, 'FAILURE');
      return { allowed: false, reason: 'Invalid staff credentials' };
    }

    const schedule = JSON.parse(profile.scheduleRaw || '{}');
    const { days = '', start_time = '00:00', end_time = '23:59' } = schedule;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

    const isDayMatch = days.includes(currentDay);
    const isTimeMatch = currentTime >= start_time && currentTime <= end_time;

    if (isDayMatch && isTimeMatch) {
      if (!deviceControl) throw new Error('Device control service is not ready.');
      const command = await deviceControl.controlAccess('lock_1', 'unlocked', profile.id, 'Validated scheduled staff access request');
      await this.broadcastUpdate();
      await this.logSecurityEvent('STAFF_AUTH', staffId, 'SUCCESS', { commandStatus: command.status });
      return { allowed: true, name: profile.name, status: command.status };
    }

    return { 
      allowed: false, 
      reason: `Access refused. Authorized for ${days} between ${start_time}-${end_time}.` 
    };
  }

  async setLocation(location: string) {
    await prisma.systemConfig.update({
      where: { id: 'GLOBAL' },
      data: { location }
    });
    await this.broadcastUpdate();
  }

  async nlpParse(rawText: string, room?: string) {
    const text = rawText.toLowerCase();
    if (isSensitiveNaturalLanguage(text)) {
      return {
        success: false,
        vaultRequired: true,
        response: 'Natural-language and voice inputs cannot authorize access or payments. Use the dedicated authenticated control.'
      };
    }
    const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    const currentMode = config?.mode;

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
        responses.push("Voice and natural-language requests cannot authorize access or payments. Use the dedicated authenticated control.");
        vaultRequired = true;
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
  io = new Server(server, { cors: { origin: allowedOrigins.length ? allowedOrigins : process.env.NODE_ENV !== 'production' } });

  // Initialize MQTT Bridge & Virtual House Simulation
  const hardwareBus = setupMQTT(io, prisma);
  deviceControl = new DeviceControlService(prisma, haBridge, hardwareBus, SIMULATION_ENABLED);
  if (SIMULATION_ENABLED) {
    console.log('🛠️  DEV MODE: Auto-starting Virtual House Simulator...');
    startSimulation();
  }

  let haSyncInProgress = false;
  const syncHomeAssistantDevices = async () => {
    if (!haBridge.isConfigured() || haSyncInProgress) return 0;
    haSyncInProgress = true;
    try {
      const haDevices = await haBridge.syncState();
      for (const dev of haDevices) {
        const type = ['light', 'switch', 'fan', 'climate', 'lock', 'cover'].includes(dev.domain)
          ? dev.domain
          : ['sensor', 'binary_sensor'].includes(dev.domain) ? 'sensor' : 'ha_linked';
        const unavailable = ['unavailable', 'unknown'].includes(dev.state.toLowerCase());
        await prisma.device.upsert({
          where: { id: dev.id },
          update: {
            name: dev.name,
            type,
            state: dev.state,
            status: unavailable ? 'OFFLINE' : 'ONLINE',
            controlProvider: 'HOME_ASSISTANT',
            controlTarget: dev.id,
            lastReportedAt: dev.lastChanged ? new Date(dev.lastChanged) : new Date(),
            lastCommandStatus: unavailable ? 'FAILED' : 'COMPLETED',
            desiredState: null,
            lastCommandError: unavailable ? 'Home Assistant reports the entity as unavailable.' : null
          } as any,
          create: {
            id: dev.id,
            name: dev.name,
            type,
            state: dev.state,
            status: unavailable ? 'OFFLINE' : 'ONLINE',
            controlProvider: 'HOME_ASSISTANT',
            controlTarget: dev.id,
            lastReportedAt: dev.lastChanged ? new Date(dev.lastChanged) : new Date(),
            lastCommandStatus: unavailable ? 'FAILED' : 'COMPLETED',
            lastCommandError: unavailable ? 'Home Assistant reports the entity as unavailable.' : null
          } as any
        });
      }
      await stateManager.broadcastUpdate();
      return haDevices.length;
    } finally {
      haSyncInProgress = false;
    }
  };

  if (haBridge.isConfigured()) {
    try {
      await haBridge.connect();
      await syncHomeAssistantDevices();
    } catch (error) {
      console.warn('[HA] Bridge unavailable at startup:', error);
    }
    setInterval(() => {
      void syncHomeAssistantDevices().catch(error => console.warn('[HA] State sync failed:', error));
    }, 15_000).unref();
  }

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : cookieValue(socket.handshake.headers.cookie, 'ujo_session');
      const auth = await authenticateSessionToken(token);
      if (!auth) return next(new Error('Authentication required.'));
      socket.data.userId = auth.user.id;
      next();
    } catch {
      next(new Error('Authentication failed.'));
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
  });

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production')) {
        return callback(null, true);
      }
      callback(new Error('Origin is not allowed.'));
    }
  }));
  app.use(express.json());

  // --- API ENDPOINTS ---

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok', mqtt: hardwareBus.connected() ? 'connected' : 'disconnected' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'error' });
    }
  });

  // Shared v1 contract is enforced before any physical device service is reached.
  app.use(createIdentityRouter({
    trust: () => loadIdentityTrust(process.env.UJO_IDENTITY_TRUST_FILE),
    state: () => stateManager.getStates(),
  }));
  app.use(createBridgeRouter({
    env: process.env,
    state: () => stateManager.getStates(),
    nodes: () => prisma.hardwareNode.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
    control: (id, state) => stateManager.updateDevice(id, state, 'aurel-bridge', 'Authenticated AUREL proposal; UJO retains authority'),
  }));

  // Signed machine-to-machine camera ingestion. This route is intentionally outside
  // user-session middleware; every request uses a per-node secret, timestamp and replay counter.
  app.post('/hardware/v1/camera/:nodeId', express.raw({ type: ['image/jpeg', 'image/jpg'], limit: '2mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ error: 'JPEG body is required.' });
    const nodeId = req.params.nodeId;
    const sequence = Number(req.headers['x-ujo-sequence']);
    const timestamp = Number(req.headers['x-ujo-timestamp']);
    const signature = String(req.headers['x-ujo-signature'] || '');
    const existingNode = await prisma.hardwareNode.findUnique({ where: { id: nodeId } });
    if (existingNode && sequence <= existingNode.lastSequence) return res.status(409).json({ error: 'Camera request rejected: replayed-request' });
    const verified = hardwareHttpAuth.verify({ nodeId, sequence, timestamp, signature }, req.body);
    if (!verified.valid) return res.status(401).json({ error: `Camera request rejected: ${verified.reason}` });
    const snapshotRoot = path.resolve(process.env.UJO_SNAPSHOT_DIR || '/app/data/snapshots');
    fs.mkdirSync(snapshotRoot, { recursive: true, mode: 0o700 });
    const filename = `${nodeId}-${timestamp}-${sequence}-${verified.bodyHash?.slice(0, 12)}.jpg`;
    const destination = path.join(snapshotRoot, filename);
    await fs.promises.writeFile(destination, req.body, { mode: 0o600 });
    await prisma.hardwareNode.upsert({
      where: { id: nodeId },
      update: { status: 'ONLINE', lastSequence: sequence, lastSeenAt: new Date(timestamp * 1000) },
      create: { id: nodeId, kind: 'camera', status: 'ONLINE', provisioned: true, lastSequence: sequence, lastSeenAt: new Date(timestamp * 1000) }
    });
    await prisma.sensorTelemetry.create({ data: { nodeId, kind: 'camera-snapshot', payload: JSON.stringify({ filename, sha256: createHash('sha256').update(req.body).digest('hex'), bytes: req.body.length }), timestamp: new Date(timestamp * 1000) } });
    res.status(201).json({ accepted: true, filename, authorization: false, retentionDays: Number(process.env.SNAPSHOT_RETENTION_DAYS || 30) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password, clientType = 'web' } = req.body ?? {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const attemptKey = `login:${req.ip}:${normalizedEmail}`;
    const attempt = loginLimiter.consume(attemptKey);
    if (!attempt.allowed) {
      res.setHeader('Retry-After', attempt.retryAfterSeconds);
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
    const user = normalizedEmail ? await prisma.userAccount.findUnique({ where: { email: normalizedEmail } }) : null;
    if (!user || user.disabled || typeof password !== 'string' || !verifyCredential(password, user.passwordHash)) {
      await stateManager.logSecurityEvent('ACCOUNT_LOGIN', normalizedEmail || 'unknown', 'FAILURE');
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    loginLimiter.reset(attemptKey);
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    await prisma.userSession.create({ data: { userId: user.id, tokenHash: sessionTokenHash(token), expiresAt } });
    await stateManager.logSecurityEvent('ACCOUNT_LOGIN', user.id, 'SUCCESS');
    if (clientType !== 'mobile') {
      res.cookie('ujo_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: expiresAt,
        path: '/'
      });
    }
    res.json({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      expiresAt,
      token: clientType === 'mobile' ? token : undefined
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const auth = await authenticateSessionToken(bearer || cookieValue(req.headers.cookie, 'ujo_session'));
    if (!auth) return res.status(401).json({ error: 'Authentication required.' });
    res.json({ id: auth.user.id, email: auth.user.email, displayName: auth.user.displayName, role: auth.user.role });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = bearer || cookieValue(req.headers.cookie, 'ujo_session');
    if (token) await prisma.userSession.updateMany({ where: { tokenHash: sessionTokenHash(token) }, data: { revoked: true } });
    res.clearCookie('ujo_session', { path: '/' });
    res.json({ success: true });
  });

  app.use('/api', async (req, res, next) => {
    try {
      const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const auth = await authenticateSessionToken(bearer || cookieValue(req.headers.cookie, 'ujo_session'));
      if (!auth) return res.status(401).json({ error: 'Authentication required.' });
      res.locals.user = { id: auth.user.id, role: auth.user.role };
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && auth.user.role !== 'OWNER') {
        return res.status(403).json({ error: 'Owner role is required for state-changing operations.' });
      }
      next();
    } catch {
      res.status(401).json({ error: 'Authentication failed.' });
    }
  });

  app.get('/api/ai/status', async (_req, res) => {
    const status = await localAIRegistry.status();
    res.status(status.ready ? 200 : 503).json(status);
  });

  app.post('/api/ai/embeddings', async (req, res) => {
    try {
      const input = req.body?.input;
      const embeddings = await ollama.embed(input);
      res.json({ model: process.env.UJO_EMBED_MODEL || 'embeddinggemma', embeddings, local: true, authorization: false });
    } catch (error) {
      res.status(422).json({ error: error instanceof Error ? error.message : 'Embedding failed.' });
    }
  });

  app.post('/api/ai/vision/analyze', async (req, res) => {
    try {
      const image = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.replace(/^data:image\/[^;]+;base64,/, '') : '';
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : 'Describe visible household or inventory conditions.';
      const result = await ollama.analyzeImage(image, prompt);
      res.json({ ...result, model: process.env.UJO_VISION_MODEL || 'gemma3:4b', local: true, authorization: false, retained: false });
    } catch (error) {
      res.status(422).json({ error: error instanceof Error ? error.message : 'Vision analysis failed.' });
    }
  });

  app.get('/api/capabilities', async (_req, res) => {
    const ha = await haBridge.getStatus();
    res.json({
      simulation: SIMULATION_ENABLED,
      manualPowerSource: ALLOW_MANUAL_POWER_SOURCE,
      homeAssistant: ha,
      mqttConnected: hardwareBus.connected(),
      controlPolicy: 'FAIL_CLOSED',
      accessControl: 'DEDICATED_AUTHENTICATED_FLOW',
      cloudControlPlane: process.env.UJO_CLOUD_URL ? 'CONFIGURED' : 'NOT_CONFIGURED'
    });
  });

  app.post('/api/mobile/context', async (req, res) => {
    const { connected, connectionType, activity, driving, batteryLevel, observedAt } = req.body ?? {};
    const allowedConnectionTypes = new Set(['wifi', 'cellular', 'none', 'unknown']);
    const sanitized = {
      connected: typeof connected === 'boolean' ? connected : undefined,
      connectionType: allowedConnectionTypes.has(String(connectionType)) ? String(connectionType) : 'unknown',
      activity: typeof activity === 'string' ? activity.slice(0, 32) : undefined,
      driving: typeof driving === 'boolean' ? driving : undefined,
      batteryLevel: Number.isFinite(Number(batteryLevel)) ? Math.max(0, Math.min(1, Number(batteryLevel))) : undefined,
      observedAt: typeof observedAt === 'string' && !Number.isNaN(Date.parse(observedAt)) ? observedAt : new Date().toISOString()
    };
    await prisma.auditLog.create({
      data: { action: 'MOBILE_CONTEXT_OBSERVED', actor: res.locals.user.id, meta: JSON.stringify(sanitized) }
    });
    res.status(202).json({ accepted: true, authorization: false });
  });

  app.post('/api/devices/:id/bind', async (req, res) => {
    const { pin, provider, target } = req.body ?? {};
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) return res.status(403).json({ error: 'Owner PIN required.' });
    if (!deviceControl) return res.status(503).json({ error: 'Device control service unavailable.' });
    try {
      const device = await deviceControl.bind(req.params.id, provider, target);
      await stateManager.logSecurityEvent('DEVICE_BINDING_CHANGED', res.locals.user.id, 'SUCCESS', { deviceId: req.params.id, provider, target });
      res.json(device);
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : 'Binding failed.' });
    }
  });

  app.post('/api/devices/:id/control', async (req, res) => {
    const { state, reason } = req.body ?? {};
    if (typeof state !== 'string') return res.status(400).json({ error: 'State is required.' });
    try {
      const result = await stateManager.updateDevice(req.params.id, state, res.locals.user.id, typeof reason === 'string' ? reason : 'Dashboard control request');
      res.status(result.status === 'COMPLETED' ? 200 : 202).json(result);
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : 'Control failed.' });
    }
  });

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
    if (!SIMULATION_ENABLED) return res.status(404).json({ error: 'Simulation is disabled.' });
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
    if (typeof id !== 'string' || typeof state !== 'string') return res.status(400).json({ error: 'Device id and state are required.' });
    try {
      const result = await stateManager.updateDevice(id, state, res.locals.user.id, 'Legacy dashboard control route');
      res.setHeader('Deprecation', 'true');
      res.status(result.status === 'COMPLETED' ? 200 : 202).json(result);
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : 'Control failed.' });
    }
  });

  app.post('/api/intercom/translate', async (req, res) => {
    const { text, dialect } = req.body;
    const translated = await translator.translateToDialect(text, dialect);
    res.json({ translated });
  });

  app.get('/api/assistant/health', async (_req, res) => {
    res.json(await ollama.health());
  });

  app.post('/api/assistant/plan', async (req, res) => {
    const { text } = req.body ?? {};
    if (typeof text !== 'string') return res.status(400).json({ error: 'Text is required.' });
    try {
      const state = await stateManager.getStates();
      const plan = await ollama.plan(text, {
        mode: state.mode,
        location: state.location,
        powerSource: state.powerSource,
        devices: state.devices.map(({ id, name, type, state: deviceState, status }) => ({ id, name, type, state: deviceState, status }))
      });
      res.json({
        ...plan,
        actions: plan.actions.map(action => ({ ...action, policy: evaluateProposedAction(action) }))
      });
    } catch (error) {
      console.error('Offline assistant planning failed:', error);
      res.status(503).json({ error: 'Offline assistant is unavailable. Deterministic controls remain operational.' });
    }
  });

  app.get('/api/hardware/nodes', async (_req, res) => {
    const nodes = await prisma.hardwareNode.findMany({ orderBy: { id: 'asc' } });
    res.json(nodes.map(node => ({
      ...node,
      allowedActions: JSON.parse(node.allowedActions || '[]')
    })));
  });

  app.post('/api/hardware/nodes/:id/provision', async (req, res) => {
    const { id } = req.params;
    const { pin, kind, room, safetyClass = 'STANDARD', allowedActions = [] } = req.body ?? {};
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) {
      await stateManager.logSecurityEvent('HARDWARE_PROVISION', id, 'FAILURE');
      return res.status(403).json({ error: 'Owner authentication required.' });
    }
    if (!hardwareBus.hasKey(id)) return res.status(400).json({ error: 'Install a node key on the hub before provisioning.' });
    if (typeof kind !== 'string' || typeof room !== 'string' || !['STANDARD', 'CRITICAL', 'ACCESS'].includes(safetyClass)) {
      return res.status(400).json({ error: 'Valid kind, room, and safety class are required.' });
    }
    const supportedActions = ['set_relay', 'reboot'];
    if (!Array.isArray(allowedActions) || allowedActions.some(action => !supportedActions.includes(action))) {
      return res.status(400).json({ error: 'One or more hardware actions are unsupported.' });
    }
    const node = await prisma.hardwareNode.upsert({
      where: { id },
      update: { kind, room, safetyClass, allowedActions: JSON.stringify(allowedActions), provisioned: true },
      create: { id, kind, room, safetyClass, allowedActions: JSON.stringify(allowedActions), provisioned: true }
    });
    await stateManager.logSecurityEvent('HARDWARE_PROVISION', 'Owner', 'SUCCESS', { nodeId: id, safetyClass });
    res.json({ ...node, allowedActions });
  });

  app.get('/api/hardware/commands', async (_req, res) => {
    await prisma.hardwareCommand.updateMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' }
    });
    res.json(await prisma.hardwareCommand.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/hardware/commands', async (req, res) => {
    const { nodeId, action, value, reason } = req.body ?? {};
    if (typeof nodeId !== 'string' || typeof action !== 'string' || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'Node, action, and reason are required.' });
    }
    const node = await prisma.hardwareNode.findUnique({ where: { id: nodeId } });
    if (!node?.provisioned) return res.status(409).json({ error: 'Node must be owner-provisioned first.' });
    if (node.safetyClass === 'ACCESS') return res.status(403).json({ error: 'Access-control nodes require the dedicated security controller.' });
    const allowedActions = JSON.parse(node.allowedActions || '[]') as string[];
    if (!allowedActions.includes(action)) return res.status(403).json({ error: 'Action is not allowed for this node.' });
    const command = await prisma.hardwareCommand.create({
      data: {
        nodeId,
        action,
        value: value === undefined ? null : String(value),
        requestedBy: res.locals.user.id,
        reason: reason.trim().slice(0, 500),
        expiresAt: new Date(Date.now() + 5 * 60_000)
      }
    });
    res.status(202).json(command);
  });

  app.post('/api/hardware/commands/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { pin } = req.body ?? {};
    const attemptKey = `hardware-approval:${req.ip}`;
    const attempt = pinLimiter.consume(attemptKey);
    if (!attempt.allowed) {
      res.setHeader('Retry-After', attempt.retryAfterSeconds);
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) {
      await stateManager.logSecurityEvent('HARDWARE_COMMAND_APPROVAL', 'Unknown', 'FAILURE', { commandId: id });
      return res.status(403).json({ error: 'Owner authentication required.' });
    }
    pinLimiter.reset(attemptKey);
    const command = await prisma.hardwareCommand.findUnique({ where: { id } });
    if (!command || command.status !== 'PENDING') return res.status(409).json({ error: 'Command is not pending.' });
    if (command.expiresAt <= new Date()) {
      await prisma.hardwareCommand.update({ where: { id }, data: { status: 'EXPIRED' } });
      return res.status(410).json({ error: 'Command expired.' });
    }
    const reserved = await prisma.hardwareCommand.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVING', approvedAt: new Date() }
    });
    if (reserved.count !== 1) return res.status(409).json({ error: 'Command was already handled.' });
    try {
      if (!hardwareBus.connected()) throw new Error('Hardware bus is offline.');
      await hardwareBus.sendCommand(id, command.nodeId, command.action, command.value ?? undefined);
      const sent = await prisma.hardwareCommand.update({ where: { id }, data: { status: 'SENT' } });
      await (prisma.device as any).updateMany({ where: { controlProvider: 'MQTT', controlTarget: command.nodeId }, data: { lastCommandStatus: 'SENT', lastCommandError: null } });
      await stateManager.broadcastUpdate();
      await stateManager.logSecurityEvent('HARDWARE_COMMAND_APPROVAL', res.locals.user.id, 'SUCCESS', { commandId: id, nodeId: command.nodeId });
      res.json(sent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Command delivery failed.';
      await prisma.hardwareCommand.update({ where: { id }, data: { status: 'PENDING', approvedAt: null, error: message } });
      await (prisma.device as any).updateMany({ where: { controlProvider: 'MQTT', controlTarget: command.nodeId }, data: { lastCommandStatus: 'PENDING_APPROVAL', lastCommandError: message } });
      await stateManager.broadcastUpdate();
      res.status(503).json({ error: message });
    }
  });

  app.get('/api/food/references', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    res.json(await prisma.foodReference.findMany({
      where: query ? { name: { contains: query } } : undefined,
      orderBy: { name: 'asc' },
      take: 100
    }));
  });

  app.get('/api/food/items', async (_req, res) => {
    const items = await prisma.inventoryItem.findMany({
      where: { consumedAt: null, discardedAt: null },
      orderBy: { updatedAt: 'desc' }
    });
    const enriched = await Promise.all(items.map(async item => {
      const [reference, observation, zoneReadings] = await Promise.all([
        item.referenceId ? prisma.foodReference.findUnique({ where: { id: item.referenceId } }) : null,
        prisma.foodObservation.findFirst({ where: { itemId: item.id }, orderBy: { timestamp: 'desc' } }),
        prisma.foodZoneReading.findMany({ where: { location: item.location }, orderBy: { timestamp: 'desc' }, take: 2 })
      ]);
      const shelfDays = item.expectedShelfLifeDays ?? (
        item.storageMethod === 'FREEZER' ? reference?.freezerDaysMax :
        item.storageMethod === 'REFRIGERATOR' ? reference?.refrigeratorDaysMax : reference?.pantryDaysMax
      );
      const latest = zoneReadings[0];
      const previous = zoneReadings[1];
      const ethyleneIncreasePct = latest?.ethylenePpm && previous?.ethylenePpm
        ? ((latest.ethylenePpm - previous.ethylenePpm) / Math.max(previous.ethylenePpm, 0.01)) * 100
        : undefined;
      const temperatureExcursionHours = latest?.temperature !== null && latest?.temperature !== undefined && (
        (item.storageMethod === 'REFRIGERATOR' && latest.temperature > 5) ||
        (item.storageMethod === 'FREEZER' && latest.temperature > -15)
      ) ? 1 : 0;
      return {
        ...item,
        freshness: estimateFreshness({
          acquiredAt: item.acquiredAt,
          openedAt: item.openedAt,
          labelExpiresAt: item.labelExpiresAt,
          expectedShelfLifeDays: shelfDays,
          afterOpeningDays: reference?.afterOpeningDaysMax,
          temperatureExcursionHours,
          ethyleneIncreasePct,
          vocAnomaly: (latest?.vocIndex ?? 0) > 250,
          visualQuality: observation?.visualQuality,
          odorConcern: observation?.odorConcern
        }),
        latestObservation: observation,
        latestZoneReading: latest
      };
    }));
    res.json(enriched);
  });

  app.post('/api/food/items', async (req, res) => {
    const { name, category = 'Other', location, storageMethod, quantity = 1, unit = 'item', referenceId, labelExpiresAt, expectedShelfLifeDays, notes } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof location !== 'string' || !['PANTRY', 'REFRIGERATOR', 'FREEZER', 'COUNTER'].includes(storageMethod)) {
      return res.status(400).json({ error: 'Name, location, and valid storage method are required.' });
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || (expectedShelfLifeDays !== undefined && (!Number.isInteger(Number(expectedShelfLifeDays)) || Number(expectedShelfLifeDays) < 1))) {
      return res.status(400).json({ error: 'Quantity and shelf life must be positive numbers.' });
    }
    if (referenceId && !(await prisma.foodReference.findUnique({ where: { id: referenceId } }))) {
      return res.status(400).json({ error: 'Food reference does not exist.' });
    }
    const parsedLabelDate = labelExpiresAt ? new Date(labelExpiresAt) : null;
    if (parsedLabelDate && Number.isNaN(parsedLabelDate.getTime())) return res.status(400).json({ error: 'Label expiry date is invalid.' });
    const item = await prisma.inventoryItem.create({ data: {
      name: name.trim().slice(0, 200), category: String(category).slice(0, 100), location: location.trim().slice(0, 100), storageMethod,
      quantity: Number(quantity), unit: String(unit).slice(0, 30), referenceId: referenceId || null,
      labelExpiresAt: parsedLabelDate,
      expectedShelfLifeDays: expectedShelfLifeDays ? Number(expectedShelfLifeDays) : null,
      notes: notes ? String(notes).slice(0, 1000) : null
    } });
    res.status(201).json(item);
  });

  app.patch('/api/food/items/:id', async (req, res) => {
    const { id } = req.params;
    const { action, quantity, location, openedAt } = req.body ?? {};
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Inventory item not found.' });
    if (!['OPEN', 'CONSUME', 'DISCARD', 'UPDATE'].includes(action)) return res.status(400).json({ error: 'Invalid inventory action.' });
    const parsedOpenedAt = action === 'OPEN' ? new Date(openedAt || Date.now()) : null;
    if (parsedOpenedAt && Number.isNaN(parsedOpenedAt.getTime())) return res.status(400).json({ error: 'Opened date is invalid.' });
    const item = await prisma.inventoryItem.update({ where: { id }, data: {
      openedAt: parsedOpenedAt ?? undefined,
      consumedAt: action === 'CONSUME' ? new Date() : undefined,
      discardedAt: action === 'DISCARD' ? new Date() : undefined,
      quantity: action === 'UPDATE' && Number(quantity) > 0 ? Number(quantity) : undefined,
      location: action === 'UPDATE' && typeof location === 'string' ? location.slice(0, 100) : undefined
    } });
    res.json(item);
  });

  app.post('/api/food/items/:id/observations', async (req, res) => {
    const { id } = req.params;
    if (!(await prisma.inventoryItem.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Inventory item not found.' });
    const { visualQuality, odorConcern = false, notes, userConfirmed = true } = req.body ?? {};
    if (visualQuality !== undefined && (!Number.isFinite(Number(visualQuality)) || Number(visualQuality) < 0 || Number(visualQuality) > 100)) {
      return res.status(400).json({ error: 'Visual quality must be from 0 to 100.' });
    }
    res.status(201).json(await prisma.foodObservation.create({ data: {
      itemId: id, visualQuality: visualQuality === undefined ? null : Number(visualQuality), odorConcern: Boolean(odorConcern),
      userConfirmed: Boolean(userConfirmed), notes: notes ? String(notes).slice(0, 1000) : null
    } }));
  });

  app.get('/api/shopping', async (_req, res) => {
    res.json(await prisma.shoppingItem.findMany({ where: { status: 'NEEDED' }, orderBy: { createdAt: 'desc' } }));
  });

  app.post('/api/shopping', async (req, res) => {
    const { name, quantity = 1, unit = 'item', reason } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return res.status(400).json({ error: 'Valid item and quantity are required.' });
    res.status(201).json(await prisma.shoppingItem.create({ data: {
      name: name.trim().slice(0, 200), quantity: Number(quantity), unit: String(unit).slice(0, 30), reason: reason ? String(reason).slice(0, 500) : null
    } }));
  });

  app.patch('/api/shopping/:id', async (req, res) => {
    const { status } = req.body ?? {};
    if (!['NEEDED', 'PURCHASED', 'DISMISSED'].includes(status)) return res.status(400).json({ error: 'Invalid shopping status.' });
    try {
      res.json(await prisma.shoppingItem.update({ where: { id: req.params.id }, data: {
        status, completedAt: status === 'NEEDED' ? null : new Date()
      } }));
    } catch {
      res.status(404).json({ error: 'Shopping item not found.' });
    }
  });

  app.get('/api/maintenance/assets', async (_req, res) => {
    const assets = await prisma.maintenanceAsset.findMany({ orderBy: { name: 'asc' } });
    res.json(assets.map(asset => ({ ...asset, assessment: assessMaintenance({ ...asset, measuredHealthScore: asset.healthScore }) })));
  });

  app.post('/api/maintenance/assets', async (req, res) => {
    const { name, kind, deviceId, nodeId, manufacturer, model, installedAt, serviceIntervalDays, serviceIntervalHours, expectedLifeHours, notes } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof kind !== 'string' || !kind.trim()) return res.status(400).json({ error: 'Asset name and kind are required.' });
    const positiveOptional = [serviceIntervalDays, serviceIntervalHours, expectedLifeHours].every(value => value === undefined || (Number.isFinite(Number(value)) && Number(value) > 0));
    if (!positiveOptional) return res.status(400).json({ error: 'Maintenance intervals must be positive.' });
    const installed = installedAt ? new Date(installedAt) : new Date();
    if (Number.isNaN(installed.getTime())) return res.status(400).json({ error: 'Installed date is invalid.' });
    res.status(201).json(await prisma.maintenanceAsset.create({ data: {
      name: name.trim().slice(0, 200), kind: kind.trim().slice(0, 100), deviceId: deviceId || null, nodeId: nodeId || null,
      manufacturer: manufacturer ? String(manufacturer).slice(0, 100) : null, model: model ? String(model).slice(0, 100) : null,
      installedAt: installed, serviceIntervalDays: serviceIntervalDays ? Number(serviceIntervalDays) : null,
      serviceIntervalHours: serviceIntervalHours ? Number(serviceIntervalHours) : null, expectedLifeHours: expectedLifeHours ? Number(expectedLifeHours) : null,
      notes: notes ? String(notes).slice(0, 1000) : null
    } }));
  });

  app.post('/api/maintenance/assets/:id/service', async (req, res) => {
    const { pin, notes } = req.body ?? {};
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) return res.status(403).json({ error: 'Owner authentication required.' });
    const asset = await prisma.maintenanceAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: 'Maintenance asset not found.' });
    const now = new Date();
    const [, event] = await prisma.$transaction([
      prisma.maintenanceAsset.update({ where: { id: asset.id }, data: { lastServicedAt: now, status: 'HEALTHY', healthScore: 100 } }),
      prisma.maintenanceEvent.create({ data: { assetId: asset.id, type: 'SERVICE', notes: notes ? String(notes).slice(0, 1000) : null, runtimeHours: asset.runtimeHours, completedAt: now } })
    ]);
    res.json(event);
  });

  app.get('/api/water/tanks', async (_req, res) => {
    const tanks = await prisma.waterTank.findMany({ orderBy: { name: 'asc' } });
    res.json(await Promise.all(tanks.map(async tank => ({
      ...tank,
      currentLitres: Math.round(tank.capacityLitres * tank.currentLevelPct / 100),
      latestReading: await prisma.waterReading.findFirst({ where: { tankId: tank.id }, orderBy: { timestamp: 'desc' } })
    }))));
  });

  app.post('/api/water/tanks', async (req, res) => {
    const { pin, name, nodeId, capacityLitres, lowLevelPct = 15, highLevelPct = 95, pumpNodeId, autoPump = false } = req.body ?? {};
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) return res.status(403).json({ error: 'Owner authentication required.' });
    if (typeof name !== 'string' || typeof nodeId !== 'string' || !Number.isFinite(Number(capacityLitres)) || Number(capacityLitres) <= 0) return res.status(400).json({ error: 'Name, sensor node, and positive capacity are required.' });
    if (Number(lowLevelPct) < 0 || Number(highLevelPct) > 100 || Number(lowLevelPct) >= Number(highLevelPct)) return res.status(400).json({ error: 'Tank thresholds are invalid.' });
    const sensorNode = await prisma.hardwareNode.findUnique({ where: { id: nodeId } });
    if (!sensorNode?.provisioned) return res.status(409).json({ error: 'Tank sensor node must be provisioned first.' });
    if (pumpNodeId) {
      const pump = await prisma.hardwareNode.findUnique({ where: { id: pumpNodeId } });
      if (!pump?.provisioned || pump.safetyClass !== 'CRITICAL') return res.status(409).json({ error: 'Pump must be a provisioned CRITICAL node.' });
    }
    res.status(201).json(await prisma.waterTank.create({ data: {
      name: name.trim().slice(0, 200), nodeId, capacityLitres: Number(capacityLitres), lowLevelPct: Number(lowLevelPct),
      highLevelPct: Number(highLevelPct), pumpNodeId: pumpNodeId || null, autoPump: Boolean(autoPump)
    } }));
  });

  app.get('/api/energy/policy', async (_req, res) => {
    res.json(await prisma.energyPolicy.upsert({ where: { id: 'GLOBAL' }, update: {}, create: { id: 'GLOBAL' } }));
  });

  app.put('/api/energy/policy', async (req, res) => {
    const { pin, minimumMainsVoltage, maximumMainsVoltage, inverterReservePct, inverterMaxWatts, generatorMaxWatts, restoreStableSeconds, mainsContactorNodeId, automaticProtection } = req.body ?? {};
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) return res.status(403).json({ error: 'Owner authentication required.' });
    const values = [minimumMainsVoltage, maximumMainsVoltage, inverterReservePct, inverterMaxWatts, generatorMaxWatts, restoreStableSeconds].map(Number);
    if (values.some(value => !Number.isFinite(value) || value <= 0) || Number(minimumMainsVoltage) >= Number(maximumMainsVoltage) || Number(inverterReservePct) >= 100) {
      return res.status(400).json({ error: 'Energy policy values are invalid.' });
    }
    if (mainsContactorNodeId) {
      const node = await prisma.hardwareNode.findUnique({ where: { id: mainsContactorNodeId } });
      if (!node?.provisioned || node.safetyClass !== 'CRITICAL') return res.status(409).json({ error: 'Mains contactor must be a provisioned CRITICAL node.' });
    }
    res.json(await prisma.energyPolicy.upsert({ where: { id: 'GLOBAL' }, create: {
      id: 'GLOBAL', minimumMainsVoltage: Number(minimumMainsVoltage), maximumMainsVoltage: Number(maximumMainsVoltage), inverterReservePct: Number(inverterReservePct),
      inverterMaxWatts: Number(inverterMaxWatts), generatorMaxWatts: Number(generatorMaxWatts), restoreStableSeconds: Number(restoreStableSeconds),
      mainsContactorNodeId: mainsContactorNodeId || null, automaticProtection: Boolean(automaticProtection)
    }, update: {
      minimumMainsVoltage: Number(minimumMainsVoltage), maximumMainsVoltage: Number(maximumMainsVoltage), inverterReservePct: Number(inverterReservePct),
      inverterMaxWatts: Number(inverterMaxWatts), generatorMaxWatts: Number(generatorMaxWatts), restoreStableSeconds: Number(restoreStableSeconds),
      mainsContactorNodeId: mainsContactorNodeId || null, automaticProtection: Boolean(automaticProtection)
    } }));
  });

  app.get('/api/energy/loads', async (_req, res) => {
    res.json(await prisma.energyLoad.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] }));
  });

  app.post('/api/energy/loads', async (req, res) => {
    const { pin, deviceId, hardwareNodeId, name, priority = 3, ratedWatts, sheddable = true, compressorLoad = false, minimumOffSeconds = 180, restoreMode = 'MANUAL' } = req.body ?? {};
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) return res.status(403).json({ error: 'Owner authentication required.' });
    if (!(await prisma.device.findUnique({ where: { id: deviceId } }))) return res.status(404).json({ error: 'Device not found.' });
    if (hardwareNodeId) {
      const node = await prisma.hardwareNode.findUnique({ where: { id: hardwareNodeId } });
      if (!node?.provisioned || node.safetyClass !== 'CRITICAL') return res.status(409).json({ error: 'Energy relay must be a provisioned CRITICAL node.' });
    }
    if (typeof name !== 'string' || !Number.isInteger(Number(priority)) || Number(priority) < 1 || Number(priority) > 5 || !Number.isFinite(Number(ratedWatts)) || Number(ratedWatts) <= 0 || !['MANUAL', 'AUTO'].includes(restoreMode)) {
      return res.status(400).json({ error: 'Energy load configuration is invalid.' });
    }
    res.status(201).json(await prisma.energyLoad.create({ data: {
      deviceId, hardwareNodeId: hardwareNodeId || null, name: name.trim().slice(0, 200), priority: Number(priority), ratedWatts: Number(ratedWatts),
      sheddable: Boolean(sheddable), compressorLoad: Boolean(compressorLoad), minimumOffSeconds: Math.max(0, Number(minimumOffSeconds) || 0), restoreMode
    } }));
  });

  app.get('/api/automations', async (_req, res) => {
    const rules = await prisma.automationRule.findMany({ orderBy: { name: 'asc' } });
    res.json(rules.map(rule => ({ ...rule, triggerConfig: JSON.parse(rule.triggerConfig), conditions: JSON.parse(rule.conditions), actions: JSON.parse(rule.actions) })));
  });

  app.post('/api/automations', async (req, res) => {
    const errors = validateAutomationDefinition(req.body ?? {});
    if (errors.length) return res.status(400).json({ errors });
    const { name, triggerType, triggerConfig = {}, conditions = [], actions, mode = 'SINGLE', maxRuns = 1, cooldownSeconds = 0 } = req.body;
    res.status(201).json(await prisma.automationRule.create({ data: {
      name: name.trim().slice(0, 200), triggerType, triggerConfig: JSON.stringify(triggerConfig), conditions: JSON.stringify(conditions), actions: JSON.stringify(actions),
      mode, maxRuns: Math.max(1, Math.min(25, Number(maxRuns) || 1)), cooldownSeconds: Math.max(0, Number(cooldownSeconds) || 0)
    } }));
  });

  app.patch('/api/automations/:id', async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Enabled must be boolean.' });
    try { res.json(await prisma.automationRule.update({ where: { id: req.params.id }, data: { enabled: req.body.enabled } })); }
    catch { res.status(404).json({ error: 'Automation not found.' }); }
  });

  app.get('/api/notifications', async (_req, res) => {
    res.json(await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }));
  });

  app.patch('/api/notifications/:id/read', async (req, res) => {
    try { res.json(await prisma.notification.update({ where: { id: req.params.id }, data: { status: 'READ', readAt: new Date() } })); }
    catch { res.status(404).json({ error: 'Notification not found.' }); }
  });

  app.get('/api/geofences', async (_req, res) => {
    res.json(await prisma.geofencePlace.findMany({ orderBy: { name: 'asc' } }));
  });

  app.post('/api/geofences', async (req, res) => {
    const { pin, name, category, latitude, longitude, radiusMetres = 250 } = req.body ?? {};
    if (typeof pin !== 'string' || !(await stateManager.verifyOwnerPin(pin))) return res.status(403).json({ error: 'Owner authentication required.' });
    if (typeof name !== 'string' || typeof category !== 'string' || !Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90 || !Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180 || Number(radiusMetres) < 50 || Number(radiusMetres) > 5000) {
      return res.status(400).json({ error: 'Geofence configuration is invalid.' });
    }
    res.status(201).json(await prisma.geofencePlace.create({ data: {
      name: name.trim().slice(0, 200), category: category.trim().toUpperCase().slice(0, 50), latitude: Number(latitude), longitude: Number(longitude), radiusMetres: Number(radiusMetres)
    } }));
  });

  app.post('/api/geofences/:id/event', async (req, res) => {
    const event = String(req.body?.event || '').toUpperCase();
    if (!['ENTER', 'EXIT'].includes(event)) return res.status(400).json({ error: 'Geofence event must be ENTER or EXIT.' });
    const place = await prisma.geofencePlace.findUnique({ where: { id: req.params.id } });
    if (!place?.enabled) return res.status(404).json({ error: 'Geofence not found or disabled.' });
    let notification = null;
    if (event === 'ENTER' && place.category === 'SUPERMARKET') {
      const shopping = await prisma.shoppingItem.findMany({ where: { status: 'NEEDED' }, orderBy: { createdAt: 'asc' } });
      if (shopping.length) notification = await prisma.notification.create({ data: {
        type: 'GEOFENCE_SHOPPING', priority: 'NORMAL', title: `Shopping reminder near ${place.name}`,
        message: `You have ${shopping.length} needed item${shopping.length === 1 ? '' : 's'}: ${shopping.slice(0, 5).map(item => item.name).join(', ')}${shopping.length > 5 ? '…' : ''}`,
        data: JSON.stringify({ placeId: place.id, shoppingItemIds: shopping.map(item => item.id) })
      } });
    }
    await automationEngine.handleEvent('GEOFENCE', { placeId: place.id, category: place.category, event });
    res.json({ success: true, notification, privacy: 'No continuous device coordinates were stored.' });
  });

  app.post('/api/voice/synthesize', async (req, res) => {
    const { text, persona = 'Ujo' } = req.body ?? {};
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > 1_000) {
      return res.status(400).json({ error: 'Text must be between 1 and 1000 characters.' });
    }
    try {
      try {
        const local = await localVoice.synthesize(text.trim(), persona);
        if (local) return res.json(local);
      } catch (localError) {
        console.warn('Local speech synthesis unavailable:', localError);
      }
      if (process.env.ALLOW_CLOUD_VOICE !== 'true') {
        return res.status(503).json({ error: 'Local speech is unavailable and cloud voice is disabled.' });
      }
      const audio = await translator.synthesizeSpeech(text.trim(), persona);
      if (!audio) return res.status(503).json({ error: 'No speech engine is configured.' });
      res.json({ audio, sampleRate: 24000, encoding: 'pcm_s16le', source: 'cloud' });
    } catch (error) {
      console.error('Speech synthesis error:', error);
      res.status(502).json({ error: 'Speech synthesis failed.' });
    }
  });

  app.post('/api/voice/transcribe', express.raw({ type: ['audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4'], limit: '10mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'A supported audio body is required.' });
    const languageHeader = req.headers['x-ujo-language'];
    const language = typeof languageHeader === 'string' && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(languageHeader) ? languageHeader : undefined;
    try {
      const transcript = await localSpeech.transcribe(req.body, req.headers['content-type'] || 'audio/webm', language);
      if (!transcript) return res.status(503).json({ error: 'Local speech recognition is not configured.' });
      res.json(transcript);
    } catch (error) {
      console.error('Local speech recognition failed:', error);
      res.status(502).json({ error: 'Local speech recognition failed.' });
    }
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
    const { text, room } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim() || text.length > 2_000) return res.status(400).json({ error: 'Text must be between 1 and 2000 characters.' });
    const result = await stateManager.nlpParse(text, typeof room === 'string' ? room : undefined);
    res.json(result);
  });

  // Explicit user presence context. Native mobile geofencing will replace this manual input.
  app.post('/api/location', async (req, res) => {
    const { location } = req.body;
    if (!['Home', 'Away'].includes(location)) return res.status(400).json({ error: 'Location must be Home or Away.' });
    await stateManager.setLocation(location);
    res.json({ success: true, location });
  });

  // Motion Detection Trigger (Fly vs Human Logic)
  app.post('/api/motion', async (req, res) => {
    if (!SIMULATION_ENABLED) return res.status(404).json({ error: 'Simulation is disabled; motion must arrive as signed sensor telemetry.' });
    const { room = 'Living Room' } = req.body ?? {};
    await stateManager.simulateMotion(room);
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
    const { id, pin } = req.body ?? {};
    if (typeof id !== 'string' || typeof pin !== 'string') {
      return res.status(400).json({ success: false, message: 'Profile ID and PIN are required.' });
    }
    const attemptKey = `staff:${req.ip}:${id}`;
    const attempt = pinLimiter.consume(attemptKey);
    if (!attempt.allowed) {
      res.setHeader('Retry-After', attempt.retryAfterSeconds);
      return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    }
    const result = await stateManager.checkStaffAccess(id, pin);
    if (result.allowed) {
      pinLimiter.reset(attemptKey);
      res.status(result.status === 'COMPLETED' ? 200 : 202).json({ success: true, message: result.status === 'COMPLETED' ? `Access granted for ${result.name}. Door unlocked.` : `Access granted for ${result.name}. Unlock command is awaiting reported state.`, status: result.status });
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
    if (!SIMULATION_ENABLED) return res.status(404).json({ error: 'Simulation is disabled; air quality must arrive as signed telemetry.' });
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
  app.post('/api/ha/sync', async (_req, res) => {
    if (!haBridge.isConfigured()) return res.status(409).json({ error: 'Home Assistant is not configured.' });
    try {
      const synced = await syncHomeAssistantDevices();
      res.json({ success: true, synced });
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'Home Assistant sync failed.' });
    }
  });

  // OVER-THE-AIR (OTA) UPDATE MANAGER
  app.post('/api/system/check-update', async (req, res) => {
    res.status(501).json({
      error: 'No signed update channel is configured. Ujo will not invent or install an unverified update.',
      required: ['signed manifest URL', 'trusted release public key', 'rollback partition or previous container image']
    });
  });

  // WHATSAPP VENDOR DISPATCH
  app.post('/api/vendor/dispatch', async (req, res) => {
    const vendorType = String(req.body?.vendorType || '').toLowerCase();
    if (!['diesel', 'water'].includes(vendorType)) return res.status(400).json({ error: 'vendorType must be diesel or water.' });
    const notification = await prisma.notification.create({ data: {
      type: 'VENDOR_DISPATCH_APPROVAL', priority: 'HIGH', title: `${vendorType} order needs approval`,
      message: `Review quantity, price, vendor identity and delivery address before contacting the ${vendorType} vendor.`,
      data: JSON.stringify({ vendorType, status: 'PENDING_APPROVAL' })
    } });
    res.status(202).json({ success: true, dispatched: false, notificationId: notification.id, status: 'PENDING_APPROVAL' });
  });

  // GUEST QR CODE GENERATOR
  app.post('/api/security/guest-code', async (req, res) => {
    const { name = 'Guest' } = req.body;
    // Generate a temporary JWT for guest access to the living room
    const expiresIn = 60 * 60; // 1 hour
    const token = jwt.sign({ role: 'guest', room: 'living_room', name }, JWT_SECRET, { expiresIn });
    
    // Save session to database
    await prisma.guestSession.create({
      data: {
        token,
        name,
        expiresAt: new Date(Date.now() + expiresIn * 1000)
      }
    });

    await stateManager.logSecurityEvent('GUEST_CODE_GEN', 'Admin', 'SUCCESS', { guest_name: name });

    // Generate the URL that the guest scans
    const accessUrl = `http://ujo-home.local/guest?token=${token}`;
    const qrCodeImage = await QRCode.toDataURL(accessUrl);
    
    res.json({ success: true, url: accessUrl, qrCode: qrCodeImage });
  });

  app.get('/api/security/guest-sessions', async (req, res) => {
    const sessions = await prisma.guestSession.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(sessions);
  });

  app.post('/api/security/revoke-session', async (req, res) => {
    const { id } = req.body;
    await prisma.guestSession.update({
      where: { id },
      data: { revoked: true }
    });
    await stateManager.logSecurityEvent('REVOCATION', 'Admin', 'SUCCESS', { session_id: id });
    res.json({ success: true });
  });

  // Voice Settings Endpoints
  app.get('/api/voice/settings', async (req, res) => {
    const settings = await prisma.voiceSettings.upsert({
      where: { id: 'GLOBAL' },
      update: {},
      create: { id: 'GLOBAL' }
    });
    res.json(settings);
  });

  app.post('/api/voice/settings', async (req, res) => {
    const { persona, pitch, speechRate } = req.body;
    const settings = await prisma.voiceSettings.update({
      where: { id: 'GLOBAL' },
      data: { persona, pitch: parseFloat(pitch), speechRate: parseFloat(speechRate) }
    });
    res.json(settings);
  });

  app.post('/api/system/simulate-tracking', async (req, res) => {
    if (!SIMULATION_ENABLED) return res.status(404).json({ error: 'Simulation endpoints are disabled.' });
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
    const isLocal = isLoopbackAddress(req.socket.remoteAddress) || req.query.local === 'true';
    res.json({ local: isLocal, latency: null, measured: false });
  });

  app.post('/api/system/onboarding/qr-handshake', (req, res) => {
    res.json({ success: true, securityEffect: 'NONE', message: 'Onboarding step acknowledged. Authentication remains bound to the current account session.' });
  });

  app.post('/api/system/onboarding/voice-calibrate', (req, res) => {
    res.json({ success: true, securityEffect: 'NONE', biometricStored: false, message: 'Microphone guidance completed; voice is not an authentication factor.' });
  });

  app.post('/api/system/vault/auth', async (req, res) => {
     const { pin } = req.body;
     const attemptKey = `vault:${req.ip}`;
     const attempt = pinLimiter.consume(attemptKey);
     if (!attempt.allowed) {
        res.setHeader('Retry-After', attempt.retryAfterSeconds);
        return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
     }
     if (typeof pin === 'string' && await stateManager.verifyOwnerPin(pin)) {
        pinLimiter.reset(attemptKey);
        await stateManager.triggerAnomaly('Vault Override Used', 'Manual PIN used for secure action authorization.', 'medium', 'security');
        res.json({ success: true });
     } else {
        await stateManager.logSecurityEvent('VAULT_PIN_ATTEMPT', 'Vault Keypad', 'FAILURE');
        res.status(403).json({ success: false, message: 'Invalid Admin PIN' });
     }
  });

  app.post('/api/system/find-phone', async (req, res) => {
    const result = await stateManager.findPhone();
    res.status(result.success ? 200 : 501).json(result);
  });

  app.post('/api/devices/lazarus-reboot', async (req, res) => {
    const { id } = req.body;
    if (typeof id !== 'string') return res.status(400).json({ error: 'Device id is required.' });
    try {
      const result = await stateManager.lazarusReboot(id, res.locals.user.id);
      res.status(result.status === 'COMPLETED' ? 200 : 202).json(result);
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : 'Reboot request failed.' });
    }
  });

  app.post('/api/system/simulate-coadmin', async (req, res) => {
    if (!SIMULATION_ENABLED) return res.status(404).json({ error: 'Simulation is disabled.' });
    io.emit('spatial-pulse', 'Co-Admin Parity Conflict: "Lock house" (Husband) vs "Leave open" (Wife) received simultaneously.');
    setTimeout(() => {
      io.emit('spatial-pulse', 'Safety Pause Initiated: Cryptographic authority identical.');
    }, 2000);
    res.json({ success: true, message: 'I am receiving conflicting Admin commands. Please confirm the final decision.'});
  });

  // Toggle Subscription (Demo/Dev)
  app.post('/api/system/toggle-subscription', async (_req, res) => {
    res.status(501).json({ error: 'Subscription state must come from the signed cloud entitlement service.' });
  });

  // POWER SOURCE ENDPOINT (Grid Guardian)
  app.post('/api/power-state', async (req, res) => {
    if (!ALLOW_MANUAL_POWER_SOURCE && !SIMULATION_ENABLED) return res.status(403).json({ error: 'Manual power-source mutation is disabled; use signed telemetry.' });
    const { source } = req.body;
    try {
      const result = await stateManager.setPowerState(source, res.locals.user.id);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid power state.' });
    }
  });

  // SECURITY UNLOCK (Duress Logic)
  app.post('/api/security/unlock', async (req, res) => {
    const { pin } = req.body;
    const attemptKey = `unlock:${req.ip}`;
    const attempt = pinLimiter.consume(attemptKey);
    if (!attempt.allowed) {
      res.setHeader('Retry-After', attempt.retryAfterSeconds);
      return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    }
    if (typeof pin !== 'string') return res.status(400).json({ success: false, message: 'PIN is required.' });
    try {
      const result = await stateManager.unlockWithPin(pin);
      if (result.success) pinLimiter.reset(attemptKey);
      res.status(result.success ? (result.status === 'COMPLETED' ? 200 : 202) : 401).json(result);
    } catch (error) {
      await stateManager.logSecurityEvent('ACCESS_CONTROL_DISPATCH', 'Physical Keypad', 'FAILURE', { error: error instanceof Error ? error.message : 'dispatch-failed' });
      res.status(409).json({ success: false, message: error instanceof Error ? error.message : 'Door command was not accepted.' });
    }
  });

  // PREDICTIVE ENGINE SIMULATOR
  app.post('/api/simulate-time', async (req, res) => {
    if (!SIMULATION_ENABLED) return res.status(404).json({ error: 'Simulation is disabled.' });
    const id = await stateManager.triggerAnomaly(
      'Spoilage Warning',
      'Fridge ethylene gas spike detected. Tomatoes in drawer are likely spoiling. Add replacements to grocery list?',
      'medium',
      'health'
    );
    res.json({ success: true, id });
  });

  if (SIMULATION_ENABLED) {
    setInterval(async () => {
      if (Math.random() > 0.95) {
        await stateManager.triggerAnomaly('Voltage Fluctuation', 'Simulation: unstable grid frequency detected.', 'MEDIUM', 'ENERGY');
      }
    }, 30_000).unref();
  }

  void purgeExpiredSnapshots().then(count => count && console.log(`[Snapshots] Purged ${count} expired file(s).`));
  setInterval(() => {
    void purgeExpiredSnapshots().then(count => count && console.log(`[Snapshots] Purged ${count} expired file(s).`));
  }, 24 * 60 * 60_000).unref();

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

  server.listen(PORT, hubListenHost(process.env), () => {
    console.log(`Ujo OS Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
