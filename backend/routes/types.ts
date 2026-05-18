import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import type { HABridge } from '../ha_bridge.ts';
import type { StateManager } from '../services/StateManager.ts';
import type { TranslatorService } from '../services/TranslatorService.ts';

export interface RouteDeps {
  prisma: PrismaClient;
  stateManager: StateManager;
  io: Server;
  haBridge: HABridge;
  translator: TranslatorService;
  jwtSecret: string;
}
