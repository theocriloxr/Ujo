import { Router } from 'express';
import type { RouteDeps } from './types.ts';

export function createDevicesRouter({ prisma, stateManager, translator }: RouteDeps) {
  const router = Router();

  router.get('/states', async (_req, res) => {
    console.log('GET /api/states hit');
    try {
      const data = await stateManager.getStates();
      res.json(data);
    } catch (error) {
      console.error('States fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch states' });
    }
  });

  router.post('/device/toggle', async (req, res) => {
    const { id, state } = req.body;
    await stateManager.updateDevice(id, state);
    res.json({ success: true });
  });

  router.post('/devices/:id/toggle-sheddable', async (req, res) => {
    const { id } = req.params;
    const device = await prisma.device.findUnique({ where: { id } });
    if (device) {
      const updated = await prisma.device.update({
        where: { id },
        data: { isSheddable: !device.isSheddable },
      });
      await stateManager.broadcastUpdate();
      return res.json({ success: true, isSheddable: updated.isSheddable });
    }
    res.status(404).json({ error: 'Device not found' });
  });

  router.post('/devices/lazarus-reboot', async (req, res) => {
    const { id } = req.body;
    const result = await stateManager.lazarusReboot(id);
    res.json(result);
  });

  router.post('/intercom/translate', async (req, res) => {
    const { text, dialect } = req.body;
    const translated = await translator.translateToDialect(text, dialect);
    res.json({ translated });
  });

  return router;
}
