import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareReplayGuard, parseNodeKeys, signEnvelope, type HardwareEnvelope } from '../src/services/hardwareProtocol.ts';

test('signed hardware telemetry verifies once and rejects tampering and replay', () => {
  const secret = 'node-secret-with-at-least-thirty-two-characters';
  const unsigned = { v: 1 as const, nodeId: 'ujo-kitchen-01', seq: 7, timestamp: 1000, type: 'telemetry' as const, payload: { temperatureC: 4.2 } };
  const envelope: HardwareEnvelope = { ...unsigned, signature: signEnvelope(unsigned, secret) };
  const guard = new HardwareReplayGuard();
  assert.equal(guard.verify(envelope, secret, 1000).valid, true);
  assert.equal(guard.verify(envelope, secret, 1000).reason, 'replayed-message');
  const tampered = { ...envelope, seq: 8, payload: { temperatureC: 40 } };
  assert.equal(new HardwareReplayGuard().verify(tampered, secret, 1000).reason, 'bad-signature');
});

test('hardware telemetry rejects stale clocks and weak key configuration', () => {
  const secret = 'node-secret-with-at-least-thirty-two-characters';
  const unsigned = { v: 1 as const, nodeId: 'ujo-tank-01', seq: 1, timestamp: 100, type: 'status' as const, payload: { online: true } };
  const envelope: HardwareEnvelope = { ...unsigned, signature: signEnvelope(unsigned, secret) };
  assert.equal(new HardwareReplayGuard().verify(envelope, secret, 1000).reason, 'stale-message');
  assert.deepEqual([...parseNodeKeys('{"ujo-tank-01":"short","ujo-grid-01":"abcdefghijklmnopqrstuvwxyz123456"}').keys()], ['ujo-grid-01']);
});
