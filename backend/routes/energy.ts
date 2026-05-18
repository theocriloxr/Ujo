import { Router } from 'express';
import type { RouteDeps } from './types.ts';

export function createEnergyRouter({ stateManager }: RouteDeps) {
  const router = Router();

  router.post('/power-state', async (req, res) => {
    const { source } = req.body;
    await stateManager.setPowerState(source);
    res.json({ success: true, source });
  });

  return router;
}
