import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBridgeRouter } from '../src/services/bridgeRouter.ts';
import { hubListenHost, parseBridgeRequest } from '../src/services/bridgePolicy.ts';

test('bridge rejects malformed requests and forged authority before dispatch over HTTP', async () => {
  let writes = 0;
  const app = express();
  app.use(express.json());
  app.use(createBridgeRouter({
    env: { NODE_ENV: 'production', UJO_BRIDGE_TOKEN: 'test-only-token' },
    state: async () => ({ simulation: true }), nodes: async () => [{ id: 'ujo-test-node' }],
    control: async (deviceId, desiredState) => {
      writes++;
      return { accepted: true, status: 'PENDING_APPROVAL', deviceId, desiredState, provider: 'MQTT', message: 'Approval required' };
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/execute`;
  const send = (body: unknown, token = 'test-only-token') => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await send({ action: 'status' }, 'wrong')).status, 401);
    for (const body of [null, [], { action: 'status', approved: true },
      { action: 'get_state', parameters: { home: 'other-home' } },
      { action: 'power_state', parameters: { source: 'GENERATOR' } },
      { action: 'device_control', parameters: null },
      { action: 'device_control', parameters: { id: '', state: 'on' } },
      { action: 'device_control', parameters: { id: 'lock', state: 'unlocked' } },
      { action: 'device_control', parameters: { id: 'light', state: 'on', approved: true } }]) {
      assert.equal((await send(body)).status, 400);
    }
    assert.equal(writes, 0);
    const nodes = await send({ action: 'list_nodes' });
    assert.deepEqual((await nodes.json()).nodes, ['ujo-test-node']);
    const response = await send({ action: 'device_control', parameters: { id: 'light', state: 'on' } });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).result.status, 'PENDING_APPROVAL');
    assert.equal(writes, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('bridge parsing is bounded and development binding is local by default', () => {
  assert.equal(parseBridgeRequest({ action: 'device_control', parameters: { id: 'x'.repeat(129), state: 'on' } }), null);
  assert.deepEqual(parseBridgeRequest({ action: 'status' }), { action: 'status', parameters: {} });
  assert.equal(hubListenHost({}), '127.0.0.1');
  assert.equal(hubListenHost({ NODE_ENV: 'production' }), '0.0.0.0');
  assert.equal(hubListenHost({ UJO_LISTEN_HOST: '192.168.1.5' }), '192.168.1.5');
});
