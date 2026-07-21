import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/gateway.ts';

function responseMock() {
  const result: any = { statusCode: 200, headers: {}, body: undefined };
  result.setHeader = (name: string, value: unknown) => { result.headers[name] = value; };
  result.status = (code: number) => { result.statusCode = code; return result; };
  result.json = (body: unknown) => { result.body = body; return result; };
  result.send = (body: unknown) => { result.body = body; return result; };
  result.end = () => result;
  return result;
}

test('Vercel preview login returns a bearer token and read-only state', async () => {
  process.env.UJO_GATEWAY_MODE = 'preview';
  process.env.UJO_GATEWAY_JWT_SECRET = 'gateway-test-secret-that-is-at-least-thirty-two-characters';
  process.env.UJO_PREVIEW_ADMIN_EMAIL = 'owner@example.com';
  process.env.UJO_PREVIEW_ADMIN_PASSWORD = 'very-long-preview-password';
  const loginRes = responseMock();
  await handler({ method: 'POST', query: { path: '/api/auth/login' }, body: { email: 'owner@example.com', password: 'very-long-preview-password' }, headers: {} }, loginRes);
  assert.equal(loginRes.statusCode, 200);
  assert.equal(typeof loginRes.body.token, 'string');

  const stateRes = responseMock();
  await handler({ method: 'GET', query: { path: '/api/states' }, body: {}, headers: { authorization: `Bearer ${loginRes.body.token}` } }, stateRes);
  assert.equal(stateRes.statusCode, 200);
  assert.equal(stateRes.body.previewReadOnly, true);
  assert.equal(stateRes.body.capabilities.preview, true);

  const mutationRes = responseMock();
  await handler({ method: 'POST', query: { path: '/api/power-state' }, body: { source: 'INVERTER' }, headers: { authorization: `Bearer ${loginRes.body.token}` } }, mutationRes);
  assert.equal(mutationRes.statusCode, 409);
});
