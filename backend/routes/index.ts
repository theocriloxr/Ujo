import type { Express } from 'express';
import type { RouteDeps } from './types.ts';
import { createDevicesRouter } from './devices.ts';
import { createSecurityRouter } from './security.ts';
import { createEnergyRouter } from './energy.ts';
import { createSystemRouter } from './system.ts';
import { createVoiceRouter } from './voice.ts';

export function registerRoutes(app: Express, deps: RouteDeps) {
  app.use('/api', createDevicesRouter(deps));
  app.use('/api', createSecurityRouter(deps));
  app.use('/api', createEnergyRouter(deps));
  app.use('/api', createSystemRouter(deps));
  app.use('/api', createVoiceRouter(deps));
}
