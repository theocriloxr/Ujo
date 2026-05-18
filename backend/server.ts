import express from 'express';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ProactiveEngine } from './services/ProactiveEngine.ts';
import { TranslatorService } from './services/TranslatorService.ts';
import { StateManager } from './services/StateManager.ts';
import { setupMQTT } from './services/mqtt_handler.ts';
import { startSimulation } from './virtual_house.ts';
import { HABridge } from './ha_bridge.ts';
import http from 'http';
import { Server } from 'socket.io';
import { registerRoutes } from './routes/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** Prisma ≥5.16 resolves relative SQLite URLs from schema.prisma's directory (backend/prisma/). */
function resolveSqliteDatabaseUrl() {
  const prismaDir = path.join(__dirname, 'prisma');
  const defaultAbs = path.join(prismaDir, 'ujo_os_v2.db');

  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    process.env.DATABASE_URL = pathToFileURL(defaultAbs).href;
    return;
  }
  if (!raw.toLowerCase().startsWith('file:')) return;

  const afterScheme = raw.slice(5);
  const isRelative =
    afterScheme.startsWith('./') ||
    afterScheme.startsWith('.\\') ||
    (!afterScheme.startsWith('/') && !afterScheme.startsWith('\\\\'));

  if (!isRelative) {
    try {
      const abs = fileURLToPath(raw);
      process.env.DATABASE_URL = pathToFileURL(abs).href;
    } catch {
      // keep original if parsing fails
    }
    return;
  }

  const posix = afterScheme.replace(/\\/g, '/').replace(/^\.\//, '');
  let absolute: string;
  if (posix === 'prisma/ujo_os_v2.db' || posix.endsWith('/prisma/ujo_os_v2.db')) {
    absolute = defaultAbs;
  } else if (posix === 'backend/prisma/ujo_os_v2.db' || posix.endsWith('/backend/prisma/ujo_os_v2.db')) {
    absolute = defaultAbs;
  } else {
    absolute = path.resolve(prismaDir, posix);
  }
  process.env.DATABASE_URL = pathToFileURL(absolute).href;
}

resolveSqliteDatabaseUrl();

const PORT = Number(process.env.PORT) || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';

const prisma = new PrismaClient();
const proactiveEngine = new ProactiveEngine(prisma);
const translator = new TranslatorService();
const stateManager = new StateManager(prisma);

const haBridge = new HABridge({
  url: process.env.HA_URL || 'http://localhost:8123',
  token: process.env.HA_TOKEN || 'dummy_token',
});

async function seedData() {
  await prisma.systemConfig.upsert({
    where: { id: 'GLOBAL' },
    update: {},
    create: {
      id: 'GLOBAL',
      mode: 'STANDARD',
      powerSource: 'MAINS',
      autoShedding: true,
    },
  });

  const count = await prisma.device.count();
  if (count === 0) {
    await prisma.device.createMany({
      data: [
        { id: 'light_1', name: 'Living Room Light', type: 'light', state: 'off', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false },
        { id: 'lock_1', name: 'Front Door Lock', type: 'lock', state: 'locked', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false },
        { id: 'fridge_1', name: 'Kitchen Fridge', type: 'appliance', state: 'normal', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false, powerUsage: 85 },
        { id: 'ac_1', name: 'Master Bedroom AC', type: 'climate', state: 'off', status: 'ONLINE', category: 'HEAVY', isSheddable: true, powerUsage: 1500 },
        { id: 'pump_1', name: 'Borehole Pump', type: 'appliance', state: 'off', status: 'ONLINE', category: 'HEAVY', isSheddable: true, powerUsage: 1200 },
        { id: 'gas_sensor', name: 'Kitchen Gas', type: 'sensor', state: '92%', status: 'ONLINE', category: 'ESSENTIAL', isSheddable: false },
      ],
    });
  }

  const profileCount = await prisma.accessProfile.count();
  if (profileCount === 0) {
    await prisma.accessProfile.create({
      data: {
        id: 'staff_1',
        name: 'Abike (Cleaner)',
        role: 'STAFF',
        pinHash: 'dummy_hash',
        scheduleRaw: JSON.stringify({
          days: 'Tuesday, Thursday',
          start_time: '10:00',
          end_time: '14:00',
        }),
      },
    });
  }
}

async function startServer() {
  await seedData();
  proactiveEngine.init();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  stateManager.setIo(io);

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

  registerRoutes(app, {
    prisma,
    stateManager,
    io,
    haBridge,
    translator,
    jwtSecret: JWT_SECRET,
  });

  setInterval(async () => {
    const chance = Math.random();
    if (chance > 0.95) {
      await stateManager.triggerAnomaly(
        'Voltage Fluctuation',
        'Unstable grid frequency detected. Stabilizing via Inverter...',
        'medium',
        'energy'
      );
    }
  }, 30000);

  if (process.env.NODE_ENV !== 'production' && !process.env.STANDALONE_BACKEND) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.join(__dirname, '../frontend/vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Stop the existing process (e.g. lsof -ti:${PORT} | xargs kill -9) and run dev again.`
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ujo OS Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
