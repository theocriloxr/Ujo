import test from 'node:test';
import assert from 'node:assert/strict';
import { isBridgeAction, isLoopbackAddress } from '../src/services/bridgePolicy.ts';

test('bridge exposes only explicitly safe smart-home actions', () => {
  assert.equal(isBridgeAction('status'), true);
  assert.equal(isBridgeAction('device_control'), true);
  assert.equal(isBridgeAction('remote_exec'), false);
  assert.equal(isBridgeAction('fs_manipulation'), false);
  assert.equal(isBridgeAction('docker_deploy'), false);
});

test('unauthenticated development bridge is loopback-only', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.20'), false);
});
