import type { ProposedAction } from './OllamaService.ts';

export type PolicyDecision = 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY';

export interface ActionDecision {
  decision: PolicyDecision;
  reason: string;
}

export function evaluateProposedAction(action: ProposedAction): ActionDecision {
  if (action.action === 'query_state') return { decision: 'ALLOW', reason: 'Read-only home state query.' };
  if (action.action === 'create_automation') {
    return { decision: 'REQUIRE_APPROVAL', reason: 'Persistent automations require owner review.' };
  }
  if (action.action === 'power_state') {
    return { decision: 'REQUIRE_APPROVAL', reason: 'Power-source changes can affect critical loads.' };
  }
  if (action.action === 'set_mode') {
    return { decision: 'REQUIRE_APPROVAL', reason: 'Security and occupancy mode changes require confirmation.' };
  }
  if (action.action === 'device_control') {
    const target = (action.target || '').toLowerCase();
    if (target.includes('lock') || target.includes('door') || target.includes('gate')) {
      return { decision: 'DENY', reason: 'AI plans cannot directly control physical access.' };
    }
    return { decision: 'REQUIRE_APPROVAL', reason: 'Device state changes require policy evaluation and user consent.' };
  }
  return { decision: 'DENY', reason: 'Unknown action.' };
}
