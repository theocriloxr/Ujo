import WebSocket from 'ws';

export interface HABridgeConfig {
  url: string;
  token: string;
  requestTimeoutMs?: number;
}

export interface HAEntityState {
  id: string;
  name: string;
  state: string;
  domain: string;
  attributes: Record<string, unknown>;
  lastChanged?: string;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

const UNSAFE_DIRECT_DOMAINS = new Set(['lock', 'alarm_control_panel']);
const SERVICE_ACTIONS: Record<string, Record<string, string>> = {
  light: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  switch: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  fan: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  media_player: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  climate: { on: 'turn_on', off: 'turn_off' },
  cover: { open: 'open_cover', close: 'close_cover', stop: 'stop_cover' }
};

function websocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/websocket';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function configuredToken(token: string): boolean {
  const value = token.trim();
  return value.length >= 20 && !/dummy|your_long_lived|replace/i.test(value);
}

export class HABridge {
  private readonly url: string;
  private readonly token: string;
  private readonly requestTimeoutMs: number;
  private ws: WebSocket | null = null;
  private connected = false;
  private authenticated = false;
  private connecting: Promise<void> | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private lastError: string | null = null;
  private version: string | null = null;
  private syncedDevices = 0;

  constructor(config: HABridgeConfig) {
    this.url = websocketUrl(config.url);
    this.token = config.token;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
  }

  isConfigured(): boolean {
    return configuredToken(this.token);
  }

  async connect(): Promise<void> {
    if (!this.isConfigured()) throw new Error('Home Assistant is not configured with a valid long-lived access token.');
    if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, { handshakeTimeout: this.requestTimeoutMs });
      this.ws = ws;
      let settled = false;
      const timeout = setTimeout(() => {
        const error = new Error('Home Assistant authentication timed out.');
        this.lastError = error.message;
        ws.terminate();
        if (!settled) reject(error);
      }, this.requestTimeoutMs);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error); else resolve();
      };

      ws.on('open', () => {
        this.connected = true;
      });

      ws.on('message', raw => {
        try {
          const message = JSON.parse(raw.toString()) as Record<string, unknown>;
          const type = String(message.type ?? '');
          if (type === 'auth_required') {
            ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
            return;
          }
          if (type === 'auth_ok') {
            this.authenticated = true;
            this.connected = true;
            this.version = typeof message.ha_version === 'string' ? message.ha_version : null;
            this.lastError = null;
            finish();
            return;
          }
          if (type === 'auth_invalid') {
            const error = new Error(typeof message.message === 'string' ? message.message : 'Home Assistant rejected authentication.');
            this.lastError = error.message;
            this.authenticated = false;
            finish(error);
            return;
          }
          if (type === 'result' && typeof message.id === 'number') {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.success === true) pending.resolve(message.result);
            else pending.reject(new Error(JSON.stringify(message.error ?? 'Home Assistant request failed.')));
          }
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : 'Invalid Home Assistant message.';
        }
      });

      ws.on('error', error => {
        this.lastError = error.message;
        finish(error);
      });

      ws.on('close', () => {
        this.connected = false;
        this.authenticated = false;
        this.ws = null;
        for (const request of this.pending.values()) {
          clearTimeout(request.timer);
          request.reject(new Error('Home Assistant connection closed.'));
        }
        this.pending.clear();
      });
    }).finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  private async request<T>(payload: Record<string, unknown>): Promise<T> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) {
      throw new Error('Home Assistant WebSocket is unavailable.');
    }
    const id = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Home Assistant request ${id} timed out.`));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer
      });
      this.ws?.send(JSON.stringify({ id, ...payload }));
    });
  }

  async getStatus() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        hub: 'Home Assistant Core',
        version: null,
        syncedDevices: 0,
        error: 'Set HA_URL and a valid HA_TOKEN to enable the bridge.'
      };
    }

    try {
      await this.connect();
      const config = await this.request<{ version?: string }>({ type: 'get_config' });
      this.version = config.version ?? this.version;
      return {
        configured: true,
        connected: true,
        hub: 'Home Assistant Core',
        version: this.version,
        syncedDevices: this.syncedDevices,
        error: null
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Home Assistant is unavailable.';
      return {
        configured: true,
        connected: false,
        hub: 'Home Assistant Core',
        version: this.version,
        syncedDevices: this.syncedDevices,
        error: this.lastError
      };
    }
  }

  async controlDevice(entityId: string, action: string) {
    const [domain] = entityId.split('.', 1);
    if (!domain || !entityId.includes('.')) throw new Error('A valid Home Assistant entity_id is required.');
    if (UNSAFE_DIRECT_DOMAINS.has(domain)) {
      throw new Error(`${domain} entities require Ujo's dedicated authenticated security workflow.`);
    }
    const normalizedAction = action.trim().toLowerCase().replace(/^turn_/, '');
    const service = SERVICE_ACTIONS[domain]?.[normalizedAction];
    if (!service) throw new Error(`Action ${action} is not allowed for Home Assistant domain ${domain}.`);

    await this.request({
      type: 'call_service',
      domain,
      service,
      service_data: { entity_id: entityId },
      return_response: false
    });
    return { success: true, target: entityId, action: service, confirmedBy: 'home_assistant' };
  }

  async controlAccessDevice(entityId: string, action: string) {
    const [domain] = entityId.split('.', 1);
    if (domain !== 'lock' || !entityId.includes('.')) {
      throw new Error('Only Home Assistant lock entities are accepted by the dedicated access workflow.');
    }
    const normalizedAction = action.trim().toLowerCase();
    if (!['lock', 'unlock', 'locked', 'unlocked'].includes(normalizedAction)) {
      throw new Error('Lock access workflow accepts only lock or unlock.');
    }
    const service = normalizedAction.startsWith('unlock') ? 'unlock' : 'lock';
    await this.request({
      type: 'call_service',
      domain: 'lock',
      service,
      service_data: { entity_id: entityId },
      return_response: false
    });
    return { success: true, target: entityId, action: service, confirmedBy: 'home_assistant' };
  }

  async syncState(): Promise<HAEntityState[]> {
    const states = await this.request<Array<{
      entity_id: string;
      state: string;
      attributes?: Record<string, unknown>;
      last_changed?: string;
    }>>({ type: 'get_states' });

    const mapped = states.map(entity => {
      const [domain] = entity.entity_id.split('.', 1);
      const friendlyName = typeof entity.attributes?.friendly_name === 'string'
        ? entity.attributes.friendly_name
        : entity.entity_id;
      return {
        id: entity.entity_id,
        name: friendlyName,
        state: entity.state,
        domain,
        attributes: entity.attributes ?? {},
        lastChanged: entity.last_changed
      };
    });
    this.syncedDevices = mapped.length;
    return mapped;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
  }
}

export const haBridgeInternals = { websocketUrl, configuredToken, SERVICE_ACTIONS };
