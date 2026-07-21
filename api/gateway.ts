import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';

type PreviewClaims = { sub: string; email: string; role: 'OWNER'; name: string; preview: true };

const JSON_HEADERS = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearer(req: any): string | undefined {
  const value = req.headers.authorization;
  return typeof value === 'string' ? value.replace(/^Bearer\s+/i, '') : undefined;
}

function previewSecret(): string {
  const secret = required('UJO_GATEWAY_JWT_SECRET');
  if (secret.length < 32) throw new Error('UJO_GATEWAY_JWT_SECRET must be at least 32 characters.');
  return secret;
}

function verifyPreview(req: any): PreviewClaims | null {
  const token = bearer(req);
  if (!token) return null;
  try {
    const claims = jwt.verify(token, previewSecret(), { algorithms: ['HS256'], audience: 'ujo-vercel-preview', issuer: 'ujo-gateway' });
    if (typeof claims === 'string' || claims.preview !== true || claims.role !== 'OWNER') return null;
    return claims as PreviewClaims;
  } catch {
    return null;
  }
}

function previewState() {
  const now = new Date().toISOString();
  return {
    deployment: 'VERCEL_PREVIEW',
    previewReadOnly: true,
    devices: [
      { id: 'preview-light', name: 'Living Room Light', type: 'light', state: 'off', status: 'PREVIEW', category: 'ESSENTIAL', isSheddable: false, powerUsage: 0, controlProvider: 'SIMULATION', lastCommandStatus: 'IDLE', lastReportedAt: now },
      { id: 'preview-fridge', name: 'Kitchen Fridge', type: 'appliance', state: 'normal', status: 'PREVIEW', category: 'ESSENTIAL', isSheddable: false, powerUsage: 85, controlProvider: 'SIMULATION', lastCommandStatus: 'IDLE', lastReportedAt: now },
      { id: 'preview-ac', name: 'Master Bedroom AC', type: 'climate', state: 'off', status: 'PREVIEW', category: 'HEAVY', isSheddable: true, powerUsage: 1500, controlProvider: 'SIMULATION', lastCommandStatus: 'IDLE', lastReportedAt: now },
      { id: 'preview-pump', name: 'Water Pump', type: 'appliance', state: 'off', status: 'PREVIEW', category: 'HEAVY', isSheddable: true, powerUsage: 1200, controlProvider: 'SIMULATION', lastCommandStatus: 'IDLE', lastReportedAt: now }
    ],
    mode: 'STANDARD',
    location: 'Preview Home',
    updateAvailable: false,
    subscriptionActive: false,
    subscriptionStatus: 'PREVIEW_ONLY',
    powerSource: 'MAINS',
    duressActive: false,
    assistantName: 'Ujo',
    alerts: [{ id: 'preview-warning', type: 'SYSTEM', severity: 'LOW', title: 'Cloud preview', message: 'This deployment is read-only. Connect the Vercel gateway to a real Ujo hub to control equipment.', acknowledged: false, timestamp: now }],
    energy: { grid: 'Connected', source: 'MAINS', voltage: 230, status: 'Preview', battery: 88, solar: 420, totalWatts: 1260, measuredAt: now, forecast: null },
    accessProfiles: [],
    capabilities: { simulation: true, preview: true, readOnly: true, manualPowerSource: false, homeAssistant: false, localVoice: false, hardwareApprovalRequired: true }
  };
}

async function proxyToHub(req: any, res: any, path: string) {
  const base = new URL(required('UJO_REMOTE_HUB_URL'));
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('UJO_REMOTE_HUB_URL must use HTTPS or HTTP.');
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') {
    return res.status(500).json({ error: 'Production hub proxy requires HTTPS.' });
  }

  const target = new URL(path, base);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.UJO_GATEWAY_TIMEOUT_MS || 30_000));
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (!value || ['host', 'connection', 'content-length', 'cookie', 'origin', 'referer'].includes(name.toLowerCase())) continue;
      headers.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }
    headers.set('x-ujo-gateway', 'vercel');
    const accessClientId = process.env.UJO_CF_ACCESS_CLIENT_ID?.trim();
    const accessClientSecret = process.env.UJO_CF_ACCESS_CLIENT_SECRET?.trim();
    if (accessClientId || accessClientSecret) {
      if (!accessClientId || !accessClientSecret) throw new Error('Both UJO_CF_ACCESS_CLIENT_ID and UJO_CF_ACCESS_CLIENT_SECRET are required.');
      headers.set('CF-Access-Client-Id', accessClientId);
      headers.set('CF-Access-Client-Secret', accessClientSecret);
    }
    const method = req.method || 'GET';
    const requestContentType = String(req.headers['content-type'] || '').toLowerCase();
    let requestBody: BodyInit | undefined;
    if (!['GET', 'HEAD'].includes(method)) {
      if (Buffer.isBuffer(req.body)) requestBody = req.body;
      else if (typeof req.body === 'string') requestBody = req.body;
      else if (requestContentType.includes('application/json')) requestBody = JSON.stringify(req.body ?? {});
      else if (req.body !== undefined && req.body !== null) requestBody = JSON.stringify(req.body);
    }
    const response = await fetch(target, {
      method,
      headers,
      body: requestBody,
      redirect: 'manual',
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    const body = Buffer.from(await response.arrayBuffer());
    return res.status(response.status).send(body);
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'The home hub did not respond before the gateway timeout.' : 'The home hub is unreachable from Vercel.';
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}

function readOnlyMutation(res: any) {
  return res.status(409).json({ error: 'The Vercel preview is read-only. Set UJO_GATEWAY_MODE=proxy and UJO_REMOTE_HUB_URL to test real controls.' });
}

async function preview(req: any, res: any, path: string) {
  if (path === '/api/health') return res.status(200).json({ ok: true, service: 'ujo-vercel-gateway', mode: 'preview', timestamp: new Date().toISOString() });
  if (path === '/api/auth/login' && req.method === 'POST') {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const expectedEmail = required('UJO_PREVIEW_ADMIN_EMAIL').toLowerCase();
    const expectedPassword = required('UJO_PREVIEW_ADMIN_PASSWORD');
    if (expectedPassword.length < 12) return res.status(500).json({ error: 'UJO_PREVIEW_ADMIN_PASSWORD must contain at least 12 characters.' });
    if (!safeEqual(email, expectedEmail) || !safeEqual(password, expectedPassword)) return res.status(401).json({ error: 'Invalid email or password.' });
    const claims: PreviewClaims = { sub: 'preview-owner', email, role: 'OWNER', name: 'Preview Owner', preview: true };
    const token = jwt.sign(claims, previewSecret(), { algorithm: 'HS256', expiresIn: '8h', audience: 'ujo-vercel-preview', issuer: 'ujo-gateway' });
    return res.status(200).json({ token, user: { id: claims.sub, email, displayName: claims.name, role: claims.role }, preview: true });
  }

  const claims = verifyPreview(req);
  if (!claims) return res.status(401).json({ error: 'Authentication required.' });
  if (path === '/api/auth/me') return res.status(200).json({ id: claims.sub, email: claims.email, displayName: claims.name, role: claims.role, preview: true });
  if (path === '/api/auth/logout') return res.status(200).json({ success: true });
  if (path === '/api/states') return res.status(200).json(previewState());
  if (path === '/api/ha/status') return res.status(200).json({ connected: false, configured: false, mode: 'preview' });
  if (path === '/api/network/p2p-check') return res.status(200).json({ local: false, latency: null, measured: false, mode: 'gateway-preview' });
  if (path === '/api/voice/settings' && req.method === 'GET') return res.status(200).json({ id: 'GLOBAL', persona: 'Ujo', pitch: 1, speechRate: 1, preview: true });
  if (path === '/api/ai/status') return res.status(200).json({ available: false, mode: 'preview', reason: 'Ollama runs on the home hub, not Vercel.' });
  if (path === '/api/security/guest-sessions') return res.status(200).json([]);
  if (path === '/api/system/check-update') return res.status(200).json({ updateAvailable: false, channel: 'preview' });
  if (path === '/api/nlp-parse' && req.method === 'POST') return res.status(200).json({ reply: 'The cloud preview cannot execute home actions. Connect a real hub to use local AI.', actions: [], preview: true });
  if (req.method && !['GET', 'HEAD'].includes(req.method)) return readOnlyMutation(res);
  return res.status(404).json({ error: `Preview route is not implemented: ${path}` });
}

export default async function handler(req: any, res: any) {
  for (const [key, value] of Object.entries(JSON_HEADERS)) res.setHeader(key, value);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const rawPath = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
  const path = typeof rawPath === 'string' ? rawPath : '';
  if (!path.startsWith('/api/') || path.includes('://')) return res.status(400).json({ error: 'A valid /api/ path is required.' });
  try {
    const mode = (process.env.UJO_GATEWAY_MODE || 'preview').toLowerCase();
    if (mode === 'proxy') return await proxyToHub(req, res, path);
    if (mode === 'preview') return await preview(req, res, path);
    return res.status(500).json({ error: 'UJO_GATEWAY_MODE must be preview or proxy.' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Gateway configuration error.' });
  }
}
