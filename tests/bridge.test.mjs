import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { BridgeError, UjoBridgeClient, parseRequest } from '../dist/index.js';

const token = 'synthetic-local-test-only';
async function hub(t, handler, timeoutMs) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, client: new UjoBridgeClient({ baseUrl: origin, token, timeoutMs }) };
}
function json(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json', 'x-ujo-protocol-version': '1.0' });
  res.end(JSON.stringify(value));
}
const control = (status = 'PENDING_APPROVAL') => ({
  status: 'success', result: { accepted: true, status, deviceId: 'synthetic-light', desiredState: 'on', provider: 'SIMULATION' },
});
const write = { action: 'device_control', parameters: { id: 'synthetic-light', state: 'on' } };
const code = expected => error => error instanceof BridgeError && error.code === expected
  && !JSON.stringify(error).includes(token) && !error.stack.includes(token);

test('versioned request conformance fixtures', async () => {
  const fixtures = JSON.parse(await readFile(new URL('../contracts/request-fixtures.json', import.meta.url), 'utf8'));
  for (const input of fixtures.valid) assert.doesNotThrow(() => parseRequest(input));
  for (const input of fixtures.invalid) assert.throws(() => parseRequest(input), code('INVALID_REQUEST'));
});

test('configuration rejects plaintext remote origins, URL secrets and invalid timeouts', () => {
  for (const baseUrl of ['http://example.com', 'ftp://localhost', 'https://user:pass@example.com',
    'https://example.com/path', 'https://example.com/?key=x', 'https://example.com/#x', 'not a URL']) {
    assert.throws(() => new UjoBridgeClient({ baseUrl, token }), code('INVALID_CONFIG'));
  }
  for (const timeoutMs of [0, -1, Infinity, NaN, 15001, 0.5]) {
    assert.throws(() => new UjoBridgeClient({ baseUrl: 'https://example.com', token, timeoutMs }), code('INVALID_CONFIG'));
  }
  for (const invalidToken of ['', 'has spaces', 'header\r\ninjection', 'x'.repeat(4097)]) {
    assert.throws(() => new UjoBridgeClient({ baseUrl: 'https://example.com', token: invalidToken }), code('INVALID_CONFIG'));
  }
  for (const baseUrl of ['https://example.com', 'http://127.0.0.1', 'http://[::1]', 'http://localhost']) {
    assert.doesNotThrow(() => new UjoBridgeClient({ baseUrl, token }));
  }
});

test('real HTTP roundtrip uses the exact path, auth header and normalized request', async t => {
  let observed;
  const { client } = await hub(t, async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    observed = { method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
    json(res, { status: 'success', state: { source: 'synthetic', devices: [] } });
  });
  const reply = await client.execute({ action: 'get_state' });
  assert.deepEqual(observed, { method: 'POST', url: '/api/v1/execute', auth: `Bearer ${token}`, body: { action: 'get_state', parameters: {} } });
  assert.equal(reply.httpStatus, 200);
  assert.equal(reply.physicalVerified, false);
  assert.equal(reply.response.state.source, 'synthetic');
  assert.ok(!JSON.stringify(client).includes(token));
});

test('node registry response remains data without physical verification', async t => {
  const { client } = await hub(t, (_req, res) => json(res, { status: 'success', nodes: ['synthetic-node'], verified: false }));
  const reply = await client.execute({ action: 'list_nodes' });
  assert.deepEqual(reply.response.nodes, ['synthetic-node']);
  assert.equal(reply.physicalVerified, false);
});

for (const status of ['PENDING_APPROVAL', 'SENT', 'COMPLETED']) {
  test(`${status} is preserved without claiming physical completion`, async t => {
    const { client } = await hub(t, (_req, res) => json(res, control(status), status === 'COMPLETED' ? 200 : 202));
    const reply = await client.execute(write);
    assert.equal(reply.response.result.status, status);
    assert.equal(reply.physicalVerified, false);
  });
}

test('malformed and extended proposals never reach the hub', async t => {
  let calls = 0;
  const { client } = await hub(t, (_req, res) => { calls++; json(res, control()); });
  await assert.rejects(client.execute({ ...write, approved: true }), code('INVALID_REQUEST'));
  await assert.rejects(client.execute({ ...write, parameters: { ...write.parameters, state: 'unlock' } }), code('INVALID_REQUEST'));
  assert.equal(calls, 0);
});

test('redirects never forward the credential or retry the operation', async t => {
  let destinationCalls = 0, originCalls = 0;
  const destination = await hub(t, (_req, res) => { destinationCalls++; json(res, control()); });
  const { client } = await hub(t, (_req, res) => {
    originCalls++; res.writeHead(307, { location: destination.origin }); res.end();
  });
  await assert.rejects(client.execute(write), code('TRANSPORT_ERROR'));
  assert.equal(originCalls, 1);
  assert.equal(destinationCalls, 0);
});

for (const status of [401, 403, 409, 429, 500]) {
  test(`HTTP ${status} is sanitized and not retried`, async t => {
    let calls = 0;
    const { client } = await hub(t, (_req, res) => { calls++; json(res, { error: token }, status); });
    await assert.rejects(client.execute(write), error => code('HTTP_ERROR')(error) && error.httpStatus === status);
    assert.equal(calls, 1);
  });
}

test('body timeout bounds a partial streaming response and does not retry', async t => {
  let calls = 0;
  const { client } = await hub(t, (_req, res) => {
    calls++; res.writeHead(200, { 'content-type': 'application/json', 'x-ujo-protocol-version': '1.0' }); res.write('{');
  }, 150);
  await assert.rejects(client.execute(write), code('TIMEOUT'));
  assert.equal(calls, 1);
});

test('caller cancellation before dispatch sends no request', async t => {
  let calls = 0;
  const { client } = await hub(t, (_req, res) => { calls++; json(res, control()); });
  await assert.rejects(client.execute(write, { signal: AbortSignal.abort() }), code('ABORTED'));
  assert.equal(calls, 0);
});

test('caller cancellation after dispatch cancels body reading', async t => {
  const controller = new AbortController();
  let calls = 0;
  const { client } = await hub(t, (_req, res) => {
    calls++; res.writeHead(200, { 'content-type': 'application/json', 'x-ujo-protocol-version': '1.0' }); res.write('{');
    setTimeout(() => controller.abort(), 30);
  });
  await assert.rejects(client.execute(write, { signal: controller.signal }), code('ABORTED'));
  assert.equal(calls, 1);
});

for (const declared of [true, false]) {
  test(`response byte limit applies with content-length=${declared}`, async t => {
    const { client } = await hub(t, (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'x-ujo-protocol-version': '1.0', ...(declared ? { 'content-length': 256001 } : {}) });
      res.end('x'.repeat(256001));
    });
    await assert.rejects(client.execute(write), code('RESPONSE_TOO_LARGE'));
  });
}

test('malformed body, wrong version/content type, state and completion mismatch fail closed', async t => {
  const cases = [
    { body: '{' }, { body: Buffer.from([0xff]) }, { body: 'null' },
    { body: JSON.stringify({ status: 'success' }) },
    { version: '2.0', body: JSON.stringify(control('COMPLETED')) },
    { contentType: 'text/html', body: JSON.stringify(control('COMPLETED')) },
    { body: JSON.stringify(control('PENDING_APPROVAL')) },
    { body: JSON.stringify({ ...control('COMPLETED'), result: { ...control('COMPLETED').result, deviceId: 'wrong-device' } }) },
  ];
  let index = 0;
  const { client } = await hub(t, (_req, res) => {
    const current = cases[index++];
    res.writeHead(200, { 'content-type': current.contentType ?? 'application/json', 'x-ujo-protocol-version': current.version ?? '1.0' });
    res.end(current.body);
  });
  for (const _current of cases) await assert.rejects(client.execute(write), code('INVALID_RESPONSE'));
});

test('connection loss returns an unknown outcome without a retry', async t => {
  let calls = 0;
  const { client } = await hub(t, (req) => { calls++; req.socket.destroy(); });
  await assert.rejects(client.execute(write), code('TRANSPORT_ERROR'));
  assert.equal(calls, 1);
});
