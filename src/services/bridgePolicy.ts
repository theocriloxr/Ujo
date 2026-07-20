export const BRIDGE_ACTIONS = [
  'status',
  'list_nodes',
  'get_state',
  'device_control',
  'power_state'
] as const;

export type BridgeAction = typeof BRIDGE_ACTIONS[number];

export function isBridgeAction(value: unknown): value is BridgeAction {
  return typeof value === 'string' && (BRIDGE_ACTIONS as readonly string[]).includes(value);
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
