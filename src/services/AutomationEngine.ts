import { PrismaClient } from '@prisma/client';
import type { AutomationAction } from './AutomationPolicy.ts';

type EventPayload = Record<string, unknown>;

export function triggerMatches(triggerType: string, config: EventPayload, eventType: string, payload: EventPayload): boolean {
  if (triggerType !== eventType) return false;
  if (triggerType === 'POWER_SOURCE') return !config.source || config.source === payload.source;
  if (triggerType === 'GEOFENCE') return (!config.placeId || config.placeId === payload.placeId) && (!config.event || config.event === payload.event);
  if (triggerType === 'PRESENCE') return (!config.room || config.room === payload.room) && (config.present === undefined || config.present === payload.present);
  if (triggerType === 'SCHEDULE') return (!config.hour || Number(config.hour) === Number(payload.hour)) && (!config.minute || Number(config.minute) === Number(payload.minute)) && (!config.weekday || Number(config.weekday) === Number(payload.weekday));
  if (triggerType === 'SENSOR_THRESHOLD') {
    const field = String(config.field || '');
    const actual = Number(payload[field]);
    const threshold = Number(config.threshold);
    if (!field || !Number.isFinite(actual) || !Number.isFinite(threshold)) return false;
    return config.operator === 'LT' ? actual < threshold : config.operator === 'LTE' ? actual <= threshold : config.operator === 'GT' ? actual > threshold : config.operator === 'GTE' ? actual >= threshold : false;
  }
  return false;
}

export class AutomationEngine {
  private readonly prisma: PrismaClient;
  constructor(prisma: PrismaClient) { this.prisma = prisma; }

  async handleEvent(eventType: string, payload: EventPayload, now = new Date()) {
    const rules = await this.prisma.automationRule.findMany({ where: { enabled: true, triggerType: eventType } });
    const results = [];
    for (const rule of rules) {
      const triggerConfig = JSON.parse(rule.triggerConfig) as EventPayload;
      if (!triggerMatches(rule.triggerType, triggerConfig, eventType, payload)) continue;
      if (rule.lastRunAt && now.getTime() - rule.lastRunAt.getTime() < rule.cooldownSeconds * 1000) continue;
      const active = await this.prisma.automationRun.count({ where: { ruleId: rule.id, status: { in: ['RUNNING', 'QUEUED'] } } });
      if (rule.mode === 'SINGLE' && active > 0) continue;
      if (rule.mode === 'PARALLEL' && active >= rule.maxRuns) continue;
      if (rule.mode === 'RESTART' && active > 0) {
        await this.prisma.automationRun.updateMany({ where: { ruleId: rule.id, status: { in: ['RUNNING', 'QUEUED'] } }, data: { status: 'CANCELLED', completedAt: now, result: 'Superseded by a newer trigger.' } });
      }
      const run = await this.prisma.automationRun.create({ data: {
        ruleId: rule.id, eventType, eventPayload: JSON.stringify(payload), status: rule.mode === 'QUEUED' && active > 0 ? 'QUEUED' : 'RUNNING'
      } });
      if (run.status === 'QUEUED') { results.push(run); continue; }
      const actions = JSON.parse(rule.actions) as AutomationAction[];
      const actionResults: string[] = [];
      try {
        for (const action of actions) actionResults.push(await this.executeAction(rule.id, action));
        await this.prisma.$transaction([
          this.prisma.automationRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', result: JSON.stringify(actionResults), completedAt: new Date() } }),
          this.prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: now } })
        ]);
      } catch (error) {
        await this.prisma.automationRun.update({ where: { id: run.id }, data: { status: 'FAILED', result: error instanceof Error ? error.message : 'Automation failed.', completedAt: new Date() } });
      }
      if (rule.mode === 'QUEUED') await this.drainQueue(rule.id, actions);
      results.push(run);
    }
    return results;
  }

  private async drainQueue(ruleId: string, actions: AutomationAction[]): Promise<void> {
    while (true) {
      const next = await this.prisma.automationRun.findFirst({ where: { ruleId, status: 'QUEUED' }, orderBy: { startedAt: 'asc' } });
      if (!next) return;
      await this.prisma.automationRun.update({ where: { id: next.id }, data: { status: 'RUNNING' } });
      try {
        const results: string[] = [];
        for (const action of actions) results.push(await this.executeAction(ruleId, action));
        await this.prisma.automationRun.update({ where: { id: next.id }, data: { status: 'COMPLETED', result: JSON.stringify(results), completedAt: new Date() } });
      } catch (error) {
        await this.prisma.automationRun.update({ where: { id: next.id }, data: { status: 'FAILED', result: error instanceof Error ? error.message : 'Automation failed.', completedAt: new Date() } });
      }
    }
  }

  private async executeAction(ruleId: string, action: AutomationAction): Promise<string> {
    if (action.type === 'NOTIFY') {
      const message = String(action.message || action.value || 'Automation notification').slice(0, 1000);
      await this.prisma.notification.create({ data: { type: 'AUTOMATION', title: 'Ujo automation', message, data: JSON.stringify({ ruleId }) } });
      return 'notification-created';
    }
    if (action.type === 'ADD_SHOPPING_ITEM') {
      const name = String(action.target || action.value || '').trim().slice(0, 200);
      if (!name) throw new Error('Shopping action has no item name.');
      await this.prisma.shoppingItem.create({ data: { name, reason: `Automation ${ruleId}` } });
      return 'shopping-item-created';
    }
    if (action.type === 'REQUEST_DEVICE_STATE') {
      const deviceId = String(action.target || '');
      const load = await this.prisma.energyLoad.findUnique({ where: { deviceId } });
      if (!load?.hardwareNodeId) throw new Error('Device is not mapped to a controllable hardware node.');
      const node = await this.prisma.hardwareNode.findUnique({ where: { id: load.hardwareNodeId } });
      if (!node?.provisioned || node.safetyClass === 'ACCESS') throw new Error('Device node cannot be controlled by generic automation.');
      await this.prisma.hardwareCommand.create({ data: {
        nodeId: node.id, action: 'set_relay', value: String(action.value) === 'on' || action.value === true ? 'true' : 'false',
        requestedBy: `automation:${ruleId}`, reason: 'Automation requested a device state change; owner approval required.',
        expiresAt: new Date(Date.now() + 5 * 60_000)
      } });
      return 'device-request-pending-approval';
    }
    if (action.type === 'SET_MODE') {
      await this.prisma.notification.create({ data: {
        type: 'MODE_APPROVAL', priority: 'HIGH', title: 'Mode change approval requested',
        message: `Automation requested mode ${String(action.value)}. Confirm it in the security controls.`, data: JSON.stringify({ ruleId, requestedMode: action.value })
      } });
      return 'mode-change-awaiting-approval';
    }
    throw new Error('Unsupported automation action.');
  }
}
