import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { verifyCriloxAccess, type IdentityTrust } from '../src/services/criloxIdentity.ts';
import { loadIdentityTrust } from '../src/services/identityRouter.ts';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 2000000000;
const trust: IdentityTrust = {
  issuer: 'https://account.example.test', audience: 'https://api.ujo.example.test', homeId: 'home-a',
  publicKeys: { test: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
  members: { user: { productAccountId: 'ujo-user', role: 'OWNER', active: true } }, revokedSessions: [],
};
const claims = { iss: trust.issuer, aud: trust.audience, sub: 'user', jti: 'request-1', sid: 'session-1', iat: now, exp: now + 120,
  product: 'ujo', product_account_id: 'ujo-user', home_id: 'home-a', scope: 'ujo:environment:read' };
const sign = (changes = {}) => jwt.sign({ ...claims, ...changes }, privateKey, { algorithm: 'RS256', header: { alg: 'RS256', typ: 'at+jwt', kid: 'test' } });

test('verified CRILOX identity maps to a separate locally authorized UJO product member', () => {
  assert.deepEqual(verifyCriloxAccess(sign(), trust, 'ujo:environment:read', now), {
    accountId: 'user', productAccountId: 'ujo-user', homeId: 'home-a', sessionId: 'session-1', scopes: ['ujo:environment:read'], role: 'OWNER',
  });
});

test('issuer, audience, account, product and home isolation fail closed', () => {
  for (const change of [{ iss: 'https://attacker.test' }, { aud: 'aurel' }, { aud: [trust.audience, 'aurel'] },
    { sub: 'other-user' }, { sub: '__proto__' }, { product: 'aurel' }, { product_account_id: 'other-product' },
    { home_id: 'home-b' }, { scope: 'aurel:memory:read' }, { scope: ['ujo:environment:read'] },
    { sid: '' }, { jti: '' }, { exp: now - 1 }, { iat: now + 1 }, { exp: now + 301 }]) {
    assert.throws(() => verifyCriloxAccess(sign(change), trust, 'ujo:environment:read', now), /access denied/);
  }
});

test('revocation and local membership disable override still-valid signed tokens', () => {
  assert.throws(() => verifyCriloxAccess(sign(), { ...trust, revokedSessions: ['session-1'] }, 'ujo:environment:read', now));
  assert.throws(() => verifyCriloxAccess(sign(), { ...trust, members: { user: { ...trust.members.user, active: false } } }, 'ujo:environment:read', now));
  assert.throws(() => verifyCriloxAccess(sign(), { ...trust, publicKeys: {} }, 'ujo:environment:read', now));
  assert.throws(() => verifyCriloxAccess(sign(), trust, 'ujo:device:control', now));
  assert.throws(() => loadIdentityTrust(undefined));
});

test('forged signatures, algorithm confusion and ID tokens do not grant resource access', () => {
  const hs = jwt.sign(claims, 'test-only-secret', { algorithm: 'HS256', header: { alg: 'HS256', typ: 'at+jwt', kid: 'test' } });
  const idToken = jwt.sign(claims, privateKey, { algorithm: 'RS256', keyid: 'test' });
  for (const value of [hs, idToken, 'not-a-token', 'x'.repeat(16385), sign().replace(/\.[^.]+$/, '.AAAA')]) {
    assert.throws(() => verifyCriloxAccess(value, trust, 'ujo:environment:read', now));
  }
});
