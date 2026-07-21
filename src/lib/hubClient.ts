import { io, Socket } from 'socket.io-client';

const HUB_URL_KEY = 'ujo_hub_url';
const SESSION_TOKEN_KEY = 'ujo_session_token';

type Handler = (...args: any[]) => void;
export interface HubSocket {
  on(event: string, handler: Handler): HubSocket;
  disconnect(): void;
}

function normalizeHubUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Hub URL must use http or https.');
  return url.origin + url.pathname.replace(/\/$/, '');
}

export function gatewayEnabled(): boolean {
  return String(import.meta.env.VITE_UJO_GATEWAY || '').toLowerCase() === 'true';
}

export function getHubUrl(): string {
  const configured = import.meta.env.VITE_UJO_HUB_URL as string | undefined;
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(HUB_URL_KEY) : null;
  return normalizeHubUrl(stored || configured || '');
}

export function setHubUrl(value: string): string {
  const normalized = normalizeHubUrl(value);
  if (typeof window !== 'undefined') {
    if (normalized) window.localStorage.setItem(HUB_URL_KEY, normalized);
    else window.localStorage.removeItem(HUB_URL_KEY);
  }
  return normalized;
}

export function getSessionToken(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_TOKEN_KEY) : null;
}

export function setSessionToken(token?: string): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  else window.localStorage.removeItem(SESSION_TOKEN_KEY);
}

export function isRemoteHub(): boolean {
  const hubUrl = getHubUrl();
  return Boolean(hubUrl && typeof window !== 'undefined' && new URL(hubUrl).origin !== window.location.origin);
}

export function usesBearerAuth(): boolean {
  return gatewayEnabled() || isRemoteHub();
}

export function hubEndpoint(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== 'string' || !input.startsWith('/')) return input;
  const directHub = getHubUrl();
  if (directHub) return `${directHub}${input}`;
  if (gatewayEnabled()) return `/api/gateway?path=${encodeURIComponent(input)}`;
  return input;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(hubEndpoint(input), {
    ...init,
    headers,
    credentials: usesBearerAuth() ? 'omit' : (init.credentials ?? 'same-origin')
  });
}

class PollingHubSocket implements HubSocket {
  private handlers = new Map<string, Set<Handler>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor() {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 5_000);
  }

  on(event: string, handler: Handler): HubSocket {
    const current = this.handlers.get(event) ?? new Set<Handler>();
    current.add(handler);
    this.handlers.set(event, current);
    return this;
  }

  private emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    try {
      const response = await apiFetch('/api/states');
      if (response.ok) this.emit('state_update', await response.json());
    } catch {
      // The main screen already exposes connection failures; polling remains quiet.
    }
  }

  disconnect(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.handlers.clear();
  }
}

export function createHubSocket(): HubSocket {
  if (gatewayEnabled() && !getHubUrl()) return new PollingHubSocket();
  const hubUrl = getHubUrl();
  const token = getSessionToken();
  return io(hubUrl || undefined, {
    auth: token ? { token } : undefined,
    transports: ['websocket', 'polling'],
    withCredentials: !isRemoteHub()
  }) as Socket;
}
