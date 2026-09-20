import { Router } from 'express';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { verifyCriloxAccess, type IdentityTrust } from './criloxIdentity.ts';

/** Reading every request makes membership/session revocation effective without restart. */
export function loadIdentityTrust(filename: string | undefined): IdentityTrust {
  if (!filename) throw new Error('Identity trust not provisioned');
  const fd = openSync(filename, 'r');
  try {
    const limit = 1024 * 1024;
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('Identity trust exceeds limit');
    // Bound the read even if the file grows after fstat. Provision by atomic replacement.
    const data = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < data.length) {
      const count = readSync(fd, data, length, data.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > limit) throw new Error('Identity trust exceeds limit');
    return JSON.parse(data.subarray(0, length).toString('utf8')) as IdentityTrust;
  } finally { closeSync(fd); }
}

export function createIdentityRouter(deps: { trust: () => IdentityTrust; state: () => Promise<unknown> }) {
  const router = Router();
  router.get('/v1/environment/state', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let trust: IdentityTrust;
    try { trust = deps.trust(); } catch {
      return res.status(503).json({ error: 'Identity trust is not available', protocol_version: '1.0' });
    }
    let principal;
    try {
      const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1] ?? '';
      principal = verifyCriloxAccess(token, trust, 'ujo:environment:read');
    } catch {
      return res.status(401).json({ error: 'CRILOX access denied', protocol_version: '1.0' });
    }
    try {
      // Tenant selection comes only from local trust plus the verified principal.
      if (Object.keys(req.query).length) return res.status(400).json({ error: 'Query selectors are not supported' });
      const state = await deps.state();
      return res.json({ protocol_version: '1.0', home_id: principal.homeId, source: 'hub', state, physical_verification: false });
    } catch {
      return res.status(503).json({ error: 'Environment state is not available', protocol_version: '1.0' });
    }
  });
  return router;
}
