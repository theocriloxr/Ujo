import { Router } from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import type { RouteDeps } from './types.ts';

export function createSecurityRouter({ prisma, stateManager, jwtSecret }: RouteDeps) {
  const router = Router();

  router.post('/motion', async (_req, res) => {
    const result = await stateManager.handleMotionAwayCheck();
    res.json(result);
  });

  router.post('/motion/simulate', async (req, res) => {
    const { room = 'Living Room' } = req.body;
    await stateManager.simulateMotion(room);
    res.json({ success: true, message: `Motion event broadcasted for ${room}` });
  });

  router.post('/access/staff-auth', async (req, res) => {
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

  router.post('/security/guest-code', async (req, res) => {
    const { name = 'Guest' } = req.body;
    const expiresIn = 60 * 60;
    const token = jwt.sign({ role: 'guest', room: 'living_room', name }, jwtSecret, { expiresIn });

    await prisma.guestSession.create({
      data: {
        token,
        name,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    await stateManager.logSecurityEvent('GUEST_CODE_GEN', 'Admin', 'SUCCESS', { guest_name: name });

    const accessUrl = `http://ujo-home.local/guest?token=${token}`;
    const qrCodeImage = await QRCode.toDataURL(accessUrl);

    res.json({ success: true, url: accessUrl, qrCode: qrCodeImage });
  });

  router.get('/security/guest-sessions', async (_req, res) => {
    const sessions = await prisma.guestSession.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions);
  });

  router.post('/security/revoke-session', async (req, res) => {
    const { id } = req.body;
    await prisma.guestSession.update({
      where: { id },
      data: { revoked: true },
    });
    await stateManager.logSecurityEvent('REVOCATION', 'Admin', 'SUCCESS', { session_id: id });
    res.json({ success: true });
  });

  router.post('/security/unlock', async (req, res) => {
    const { pin } = req.body;
    const result = await stateManager.unlockWithPin(pin);
    res.json(result);
  });

  return router;
}
