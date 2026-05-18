import { Router } from 'express';
import type { RouteDeps } from './types.ts';

export function createSystemRouter({ prisma, stateManager, io, haBridge }: RouteDeps) {
  const router = Router();

  router.post('/mode', async (req, res) => {
    const { mode } = req.body;
    if (!['Standard', 'Sleep', 'Manual Override'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    await stateManager.setMode(mode);
    res.json({ success: true, mode });
  });

  router.post('/anomaly', async (_req, res) => {
    const id = await stateManager.triggerAnomaly(
      'Fridge Power Spike',
      'Unusual power draw detected in Kitchen Fridge. Potential compressor failure. Shut down appliance?',
      'high'
    );
    res.json({ success: true, id });
  });

  router.post('/hitl/confirm', async (req, res) => {
    const { id, action } = req.body;
    const result = await stateManager.confirmAlert(id, action);
    res.json(result);
  });

  router.post('/system/toggle-shedding', async (_req, res) => {
    const config = await prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    if (config) {
      await prisma.systemConfig.update({
        where: { id: 'GLOBAL' },
        data: { autoShedding: !config.autoShedding },
      });
      await stateManager.broadcastUpdate();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Config not found' });
    }
  });

  router.post('/location', async (req, res) => {
    const { location } = req.body;
    await stateManager.setLocation(location);
    res.json({ success: true, location });
  });

  router.post('/health/co2-trigger', async (_req, res) => {
    const id = await stateManager.triggerAnomaly(
      'Air Quality Warning',
      'CO2 levels in Master Bedroom have spiked to 1200ppm. Activating AC fan to cycle fresh air.',
      'low',
      'health'
    );
    res.json({ success: true, id });
  });

  router.get('/ha/status', async (_req, res) => {
    console.log('GET /api/ha/status hit');
    const status = await haBridge.getStatus();
    res.json(status);
  });

  router.post('/ha/sync', async (_req, res) => {
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
          status: 'ONLINE',
        },
      });
    }
    res.json({ success: true, synced: haDevices.length });
  });

  router.post('/system/check-update', async (_req, res) => {
    await stateManager.triggerAnomaly(
      'System-Wide OTA Update Ready',
      'Ujo OS V2.1.0 & Mobile App V1.2.0 are ready. Install updates now?',
      'medium',
      'system'
    );
    res.json({ success: true });
  });

  router.post('/vendor/dispatch', async (req, res) => {
    const { vendorType } = req.body;
    console.log(
      `[WHATSAPP API] Sending message to ${vendorType === 'diesel' ? process.env.VENDOR_DIESEL_CONTACT : '+local'}`
    );

    await stateManager.triggerAnomaly(
      'Vendor Auto-Dispatch',
      `WhatsApp message sent to local ${vendorType} vendor. Expect delivery shortly.`,
      'low',
      'vendor'
    );
    res.json({ success: true, message: `Dispatched ${vendorType} via WhatsApp Edge Module.` });
  });

  router.post('/system/simulate-tracking', async (_req, res) => {
    io.emit('state-update');

    const sendPulse = (msg: string, delay: number) => {
      setTimeout(() => io.emit('spatial-pulse', msg), delay);
    };

    sendPulse('[mmWave 60GHz]: User A detected in Kitchen. Confidence: 100%. Audio locked.', 500);
    sendPulse('[mmWave 60GHz]: User C enters Kitchen. Identity tracking split. Confidence: 50% each.', 3500);
    sendPulse('[Ghosting/Split detected]: User C walks to Hallway. Confidence below 90% threshold.', 6500);
    sendPulse('[Sticky Audio Protocol]: Micro-Doppler Gait mismatch. Audio retains in Kitchen.', 8500);
    sendPulse('[Edge Vision ESP32-CAM]: Captured face. Local embedding match -> User C. Deleted frame.', 10500);
    sendPulse('[Sensor Fusion Override]: Radar ghosting resolved via vision. Audio locked to Kitchen for User A.', 12500);
    sendPulse('[Simulating Sensor Error]: Moving audio to Hallway arbitrarily.', 15500);
    sendPulse('User A: "Ujo, I\'m here."', 18000);
    sendPulse(
      '[Spatial Re-anchoring Protocol]: Matched User A voice print via Kitchen mic array. Reversing move. Updating radar weights.',
      20500
    );

    res.json({ success: true, message: 'Tracking override initiated' });
  });

  router.get('/network/p2p-check', (req, res) => {
    const isLocal = req.query.local === 'true';
    res.json({ local: isLocal, latency: isLocal ? '0ms' : '240ms' });
  });

  router.post('/system/onboarding/qr-handshake', (_req, res) => {
    res.json({ success: true, message: 'Cryptographic link established. No cloud registration required.' });
  });

  router.post('/system/onboarding/voice-calibrate', (_req, res) => {
    res.json({ success: true, message: 'Voice signature localized. User A identified as SuperAdmin.' });
  });

  router.post('/system/vault/auth', async (req, res) => {
    const { pin } = req.body;
    if (pin === '1234') {
      await stateManager.triggerAnomaly(
        'Vault Override Used',
        'Manual PIN used for secure action authorization.',
        'medium',
        'security'
      );
      res.json({ success: true });
    } else {
      res.status(403).json({ success: false, message: 'Invalid Admin PIN' });
    }
  });

  router.post('/system/find-phone', async (_req, res) => {
    const result = await stateManager.findPhone();
    res.json(result);
  });

  router.get('/test-env', (_req, res) => {
    res.json({ val: process.env.GEMINI_API_KEY });
  });

  router.post('/system/simulate-coadmin', (_req, res) => {
    io.emit('spatial-pulse', 'Co-Admin Parity Conflict: "Lock house" (Husband) vs "Leave open" (Wife) received simultaneously.');
    setTimeout(() => {
      io.emit('spatial-pulse', 'Safety Pause Initiated: Cryptographic authority identical.');
    }, 2000);
    res.json({
      success: true,
      message: 'I am receiving conflicting Admin commands. Please confirm the final decision.',
    });
  });

  router.post('/system/toggle-subscription', (_req, res) => {
    res.json({ success: true, active: true });
  });

  router.post('/simulate-time', async (_req, res) => {
    const id = await stateManager.triggerAnomaly(
      'Spoilage Warning',
      'Fridge ethylene gas spike detected. Tomatoes in drawer are likely spoiling. Add replacements to grocery list?',
      'medium',
      'health'
    );
    res.json({ success: true, id });
  });

  return router;
}
