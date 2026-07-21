import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { HardwareHttpAuthenticator } from '../src/services/hardwareHttpAuth.ts';

test('signed camera uploads reject tampering and replay', () => {
  const previous = process.env.UJO_NODE_KEYS_JSON;
  process.env.UJO_NODE_KEYS_JSON = JSON.stringify({ 'ujo-camera-01': 'camera-node-secret-that-is-definitely-over-32-chars' });
  try {
    const auth = new HardwareHttpAuthenticator();
    const body = Buffer.from('jpeg-test-body');
    const timestamp = Math.floor(Date.now() / 1000);
    const sequence = 7;
    const hash = createHash('sha256').update(body).digest('hex');
    const signature = createHmac('sha256', 'camera-node-secret-that-is-definitely-over-32-chars')
      .update(`ujo-camera-01|${sequence}|${timestamp}|${hash}`).digest('hex');
    assert.equal(auth.verify({ nodeId: 'ujo-camera-01', sequence, timestamp, signature }, body).valid, true);
    assert.equal(auth.verify({ nodeId: 'ujo-camera-01', sequence, timestamp, signature }, body).reason, 'replayed-request');
    assert.equal(auth.verify({ nodeId: 'ujo-camera-01', sequence: sequence + 1, timestamp, signature }, Buffer.from('tampered')).reason, 'bad-signature');
  } finally {
    if (previous === undefined) delete process.env.UJO_NODE_KEYS_JSON;
    else process.env.UJO_NODE_KEYS_JSON = previous;
  }
});
