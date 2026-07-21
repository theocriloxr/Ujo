import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { apiFetch, gatewayEnabled, getHubUrl, setHubUrl, setSessionToken, usesBearerAuth } from './lib/hubClient';

interface AuthGateProps { children: ReactNode }
interface User { displayName: string; email: string; role: string }

export default function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hubUrl, setHubUrlInput] = useState(getHubUrl());
  const gateway = gatewayEnabled();

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(async response => response.ok ? setUser(await response.json()) : null)
      .catch(() => setError('The configured Ujo hub is unreachable.'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      setHubUrl(hubUrl);
      const form = new FormData(event.currentTarget);
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          clientType: usesBearerAuth() ? 'mobile' : 'web'
        })
      });
      const body = await response.json();
      if (!response.ok) return setError(body.error || 'Login failed.');
      setSessionToken(body.token);
      setUser(body.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.');
    }
  };

  if (loading) return <main className="min-h-screen bg-black text-white grid place-items-center font-mono">AUTHENTICATING HUB SESSION…</main>;
  if (user) return <>{children}</>;

  return (
    <main className="min-h-screen bg-[#050505] text-white grid place-items-center p-6">
      <form onSubmit={login} className="w-full max-w-md border border-white/10 bg-white/[0.03] rounded-2xl p-8 space-y-6 shadow-2xl">
        <div>
          <p className="font-mono text-xs tracking-[0.35em] text-yellow-400">UJO EDGE HUB</p>
          <h1 className="text-3xl font-semibold mt-3">Owner sign in</h1>
          <p className="text-zinc-500 text-sm mt-2">{gateway ? 'This deployment uses the Ujo Vercel gateway. Leave Hub URL blank for gateway preview/proxy mode, or enter a direct HTTPS hub address.' : 'Enter the local hub address at home or its secure HTTPS address for a hosted web/mobile client.'}</p>
        </div>
        <label className="block text-sm text-zinc-400">Hub URL
          <input
            value={hubUrl}
            onChange={event => setHubUrlInput(event.target.value)}
            type="url"
            placeholder="https://hub.example.com (blank = same origin)"
            className="mt-2 w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-yellow-400"
          />
        </label>
        <label className="block text-sm text-zinc-400">Email
          <input name="email" type="email" autoComplete="username" required className="mt-2 w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-yellow-400" />
        </label>
        <label className="block text-sm text-zinc-400">Password
          <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-yellow-400" />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded-lg bg-yellow-400 py-3 font-semibold text-black hover:bg-yellow-300">Connect securely</button>
      </form>
    </main>
  );
}
