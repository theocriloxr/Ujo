export const BRIDGE_ACTIONS = [
  'status',
  'list_nodes',
  'get_state',
  'device_control'
] as const;

export type BridgeAction = typeof BRIDGE_ACTIONS[number];

export function isBridgeAction(value: unknown): value is BridgeAction {
  return typeof value === 'string' && (BRIDGE_ACTIONS as readonly string[]).includes(value);
}

export type BridgeRequest =
  | { action: 'status' | 'list_nodes' | 'get_state'; parameters: Record<string, never> }
  | { action: 'device_control'; parameters: { id: string; state: 'on' | 'off' } };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Matches coordination/AUREL_UJO_CAPABILITIES_V1.json, including extra-key denial. */
export function parseBridgeRequest(value: unknown): BridgeRequest | null {
  if (!isObject(value) || Object.keys(value).some(key => !['action', 'parameters'].includes(key))) return null;
  if (!isBridgeAction(value.action)) return null;
  const parameters = value.parameters === undefined ? {} : value.parameters;
  if (!isObject(parameters)) return null;
  if (value.action !== 'device_control') {
    return Object.keys(parameters).length === 0 ? { action: value.action, parameters: {} } : null;
  }
  if (Object.keys(parameters).some(key => !['id', 'state'].includes(key))) return null;
  if (typeof parameters.id !== 'string' || parameters.id.length < 1 || parameters.id.length > 128) return null;
  if (parameters.state !== 'on' && parameters.state !== 'off') return null;
  return { action: value.action, parameters: { id: parameters.id, state: parameters.state } };
}

export function hubListenHost(env: NodeJS.ProcessEnv): string {
  return env.UJO_LISTEN_HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
