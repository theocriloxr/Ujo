import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { createIdentityRouter, loadIdentityTrust } from '../src/services/identityRouter.ts';
import type { IdentityTrust } from '../src/services/criloxIdentity.ts';

test('identity HTTP boundary isolates homes, revokes access and distinguishes resource faults', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const trust: IdentityTrust = {
    issuer: 'https://account.example.test', audience: 'ujo-test', homeId: 'home-a',
    publicKeys: { test: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    members: { user: { productAccountId: 'ujo-user', role: 'OWNER', active: true } }, revokedSessions: [],
  };
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ iss: trust.issuer, aud: trust.audience, sub: 'user', jti: 'request', sid: 'session',
    iat: now, exp: now + 120, product: 'ujo', product_account_id: 'ujo-user', home_id: 'home-a', scope: 'ujo:environment:read' },
  privateKey, { algorithm: 'RS256', header: { alg: 'RS256', typ: 'at+jwt', kid: 'test' } });
  let reads = 0;
  let unavailable = false;
  let stateFailure = false;
  const app = express();
  app.use(createIdentityRouter({
    trust: () => { if (unavailable) throw new Error('private path'); return trust; },
    state: async () => { reads++; if (stateFailure) throw new Error('private driver fault'); return { simulation: true }; },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/environment/state`;
  const send = (credential = token, query = '') => fetch(url + query, { headers: { authorization: `Bearer ${credential}` } });
  try {
    assert.equal((await send('forged')).status, 401);
    assert.equal((await send(token, '?home_id=home-b')).status, 400);
    assert.equal(reads, 0);
    const response = await send();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { protocol_version: '1.0', home_id: 'home-a', source: 'hub', state: { simulation: true }, physical_verification: false });
    trust.revokedSessions.push('session');
    assert.equal((await send()).status, 401);
    assert.equal(reads, 1);
    trust.revokedSessions.length = 0;
    stateFailure = true;
    const failed = await send();
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).error, 'Environment state is not available');
    unavailable = true;
    const missing = await send();
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).error, 'Identity trust is not available');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('local trust loader bounds files and observes replacement on subsequent reads', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ujo-public-trust-'));
  const filename = join(directory, 'trust.json');
  try {
    writeFileSync(filename, JSON.stringify({ revokedSessions: [] }));
    assert.deepEqual(loadIdentityTrust(filename).revokedSessions, []);
    writeFileSync(filename, JSON.stringify({ revokedSessions: ['revoked'] }));
    assert.deepEqual(loadIdentityTrust(filename).revokedSessions, ['revoked']);
    writeFileSync(filename, Buffer.alloc(1024 * 1024 + 1));
    assert.throws(() => loadIdentityTrust(filename), /limit/);
    writeFileSync(filename, '{');
    assert.throws(() => loadIdentityTrust(filename));
    assert.throws(() => loadIdentityTrust(directory));
  } finally { unlinkSync(filename); rmdirSync(directory); }
});
