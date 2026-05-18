import { Router } from 'express';
import type { RouteDeps } from './types.ts';

export function createVoiceRouter({ prisma, stateManager }: RouteDeps) {
  const router = Router();

  router.get('/voice/settings', async (_req, res) => {
    const settings = await prisma.voiceSettings.upsert({
      where: { id: 'GLOBAL' },
      update: {},
      create: { id: 'GLOBAL' },
    });
    res.json(settings);
  });

  router.post('/voice/settings', async (req, res) => {
    const { persona, pitch, speechRate, rate } = req.body;
    const settings = await prisma.voiceSettings.update({
      where: { id: 'GLOBAL' },
      data: {
        persona,
        pitch: parseFloat(pitch),
        speechRate: parseFloat(speechRate ?? rate),
      },
    });
    res.json(settings);
  });

  router.post('/nlp-parse', async (req, res) => {
    const { text, room, securityFlags } = req.body;
    const result = await stateManager.nlpParse(text, room, securityFlags);
    res.json(result);
  });

  return router;
}
