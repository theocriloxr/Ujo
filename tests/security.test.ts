import test from 'node:test';
import assert from 'node:assert/strict';
import { AttemptLimiter, assertProductionSecrets, hashCredential, hashPin, sessionTokenHash, verifyCredential, verifyPin } from '../src/services/security.ts';

test('PIN hashes are salted and verify without storing plaintext', () => {
  const first = hashPin('1234');
  const second = hashPin('1234');
  assert.notEqual(first, second);
  assert.equal(first.includes('1234'), false);
  assert.equal(verifyPin('1234', first), true);
  assert.equal(verifyPin('9999', first), false);
  assert.equal(verifyPin('bad', first), false);
});

test('production refuses missing or weak secrets', () => {
  assert.throws(() => assertProductionSecrets({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => assertProductionSecrets({
    NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32)
  }), /UJO_OWNER_PIN/);
  assert.throws(() => assertProductionSecrets({
    NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), UJO_OWNER_PIN: '1234', UJO_DURESS_PIN: '1234', UJO_STAFF_PIN: '2468'
  }), /must be different/);
  assert.doesNotThrow(() => assertProductionSecrets({
    NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), UJO_OWNER_PIN: '1234', UJO_DURESS_PIN: '9999', UJO_STAFF_PIN: '2468', UJO_BRIDGE_TOKEN: 'b'.repeat(32), APP_ORIGINS: 'https://ujo.local', UJO_ADMIN_EMAIL: 'owner@example.com', UJO_ADMIN_PASSWORD: 'a-long-admin-password'
  }));
});

test('account credentials and session tokens are stored as one-way hashes', () => {
  const passwordHash = hashCredential('correct horse battery staple');
  assert.equal(verifyCredential('correct horse battery staple', passwordHash), true);
  assert.equal(verifyCredential('wrong password', passwordHash), false);
  assert.equal(sessionTokenHash('token-value'), sessionTokenHash('token-value'));
  assert.notEqual(sessionTokenHash('token-value'), 'token-value');
});

test('attempt limiter blocks repeated guesses and resets safely', () => {
  const limiter = new AttemptLimiter(2, 1_000);
  assert.equal(limiter.consume('device', 0).allowed, true);
  assert.equal(limiter.consume('device', 1).allowed, true);
  assert.equal(limiter.consume('device', 2).allowed, false);
  limiter.reset('device');
  assert.equal(limiter.consume('device', 3).allowed, true);
  assert.equal(limiter.consume('device', 1_100).allowed, true);
});
