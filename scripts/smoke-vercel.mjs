const base = (process.env.UJO_TEST_URL || '').replace(/\/$/, '');
const email = process.env.UJO_TEST_EMAIL || '';
const password = process.env.UJO_TEST_PASSWORD || '';
if (!base || !email || !password) {
  console.error('Set UJO_TEST_URL, UJO_TEST_EMAIL and UJO_TEST_PASSWORD.');
  process.exit(2);
}
const gateway = path => `${base}/api/gateway?path=${encodeURIComponent(path)}`;
const health = await fetch(gateway('/api/health'));
if (!health.ok) throw new Error(`Gateway health failed: ${health.status} ${await health.text()}`);
console.log('gateway health:', await health.json());
const login = await fetch(gateway('/api/auth/login'), {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, clientType: 'mobile' })
});
if (!login.ok) throw new Error(`Login failed: ${login.status} ${await login.text()}`);
const session = await login.json();
if (!session.token) throw new Error('Login did not return a bearer token.');
const states = await fetch(gateway('/api/states'), { headers: { authorization: `Bearer ${session.token}` } });
if (!states.ok) throw new Error(`States failed: ${states.status} ${await states.text()}`);
const state = await states.json();
console.log(`login/state smoke test passed; deployment=${state.deployment || 'real-hub'}, devices=${state.devices?.length || 0}`);
