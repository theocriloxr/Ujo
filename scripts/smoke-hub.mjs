const base = (process.env.UJO_HUB_TEST_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const email = process.env.UJO_TEST_EMAIL || '';
const password = process.env.UJO_TEST_PASSWORD || '';
if (!email || !password) {
  console.error('Set UJO_TEST_EMAIL and UJO_TEST_PASSWORD. UJO_HUB_TEST_URL defaults to http://127.0.0.1:3000.');
  process.exit(2);
}
const health = await fetch(`${base}/api/health`);
if (!health.ok) throw new Error(`Hub health failed: ${health.status} ${await health.text()}`);
console.log('hub health:', await health.json());
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, clientType: 'mobile' })
});
if (!login.ok) throw new Error(`Hub login failed: ${login.status} ${await login.text()}`);
const session = await login.json();
const headers = { authorization: `Bearer ${session.token}` };
for (const path of ['/api/states', '/api/capabilities', '/api/ai/status']) {
  const response = await fetch(`${base}${path}`, { headers });
  const body = await response.text();
  if (!response.ok && path !== '/api/ai/status') throw new Error(`${path} failed: ${response.status} ${body}`);
  console.log(path, response.status, body.slice(0, 500));
}
console.log('hub smoke test completed. A 503 AI status means model services are not ready yet.');
