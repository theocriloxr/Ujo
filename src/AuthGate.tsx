import { FormEvent, ReactNode, useEffect, useState } from 'react';

interface AuthGateProps { children: ReactNode }
interface User { displayName: string; email: string; role: string }

export default function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async response => response.ok ? setUser(await response.json()) : null)
      .catch(() => setError('The local Ujo hub is unreachable.'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
    });
    const body = await response.json();
    if (!response.ok) return setError(body.error || 'Login failed.');
    setUser(body.user);
  };

  if (loading) return <main className="min-h-screen bg-black text-white grid place-items-center font-mono">AUTHENTICATING LOCAL SESSION…</main>;
  if (user) return <>{children}</>;

  return (
    <main className="min-h-screen bg-[#050505] text-white grid place-items-center p-6">
      <form onSubmit={login} className="w-full max-w-md border border-white/10 bg-white/[0.03] rounded-2xl p-8 space-y-6 shadow-2xl">
        <div>
          <p className="font-mono text-xs tracking-[0.35em] text-yellow-400">UJO LOCAL HUB</p>
          <h1 className="text-3xl font-semibold mt-3">Owner sign in</h1>
          <p className="text-zinc-500 text-sm mt-2">Credentials are verified on this home hub. Cloud access is not required.</p>
        </div>
        <label className="block text-sm text-zinc-400">Email
          <input name="email" type="email" autoComplete="username" required className="mt-2 w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-yellow-400" />
        </label>
        <label className="block text-sm text-zinc-400">Password
          <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-yellow-400" />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded-lg bg-yellow-400 py-3 font-semibold text-black hover:bg-yellow-300">Sign in locally</button>
      </form>
    </main>
  );
}
