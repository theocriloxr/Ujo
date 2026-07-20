export const TRIGGER_TYPES = ['SENSOR_THRESHOLD', 'SCHEDULE', 'PRESENCE', 'POWER_SOURCE', 'GEOFENCE'] as const;
export const ACTION_TYPES = ['REQUEST_DEVICE_STATE', 'NOTIFY', 'ADD_SHOPPING_ITEM', 'SET_MODE'] as const;
export const AUTOMATION_MODES = ['SINGLE', 'RESTART', 'QUEUED', 'PARALLEL'] as const;

export interface AutomationAction { type: typeof ACTION_TYPES[number]; target?: string; value?: unknown; message?: string }

export function validateAutomationDefinition(input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof input.name !== 'string' || input.name.trim().length < 3) errors.push('Name must contain at least three characters.');
  if (!TRIGGER_TYPES.includes(input.triggerType as never)) errors.push('Trigger type is not supported.');
  if (!AUTOMATION_MODES.includes((input.mode ?? 'SINGLE') as never)) errors.push('Automation mode is not supported.');
  const actions = input.actions;
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > 20) errors.push('One to twenty actions are required.');
  else for (const action of actions) {
    if (!action || typeof action !== 'object' || !ACTION_TYPES.includes((action as AutomationAction).type as never)) errors.push('Automation contains an unsupported action.');
    if ((action as AutomationAction).type === 'REQUEST_DEVICE_STATE') {
      const target = String((action as AutomationAction).target || '').toLowerCase();
      if (!target) errors.push('Device request needs a target.');
      if (target.includes('lock') || target.includes('door') || target.includes('gate')) errors.push('Generic automations cannot control access devices.');
    }
  }
  return errors;
}
