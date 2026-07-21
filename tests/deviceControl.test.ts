import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceControlService } from '../src/services/DeviceControlService.ts';

function fixture(overrides: Record<string, unknown> = {}) {
  const device = {
    id: 'light-1', type: 'light', state: 'off', controlProvider: 'UNBOUND', controlTarget: null,
    ...overrides
  };
  const updates: any[] = [];
  const commands: any[] = [];
  const prisma: any = {
    device: {
      findUnique: async () => device,
      update: async ({ data }: any) => { updates.push(data); Object.assign(device, data); return device; }
    },
    hardwareNode: { findUnique: async () => ({ id: 'node-1', provisioned: true, safetyClass: 'STANDARD', allowedActions: '["set_relay"]' }) },
    hardwareCommand: { create: async ({ data }: any) => { const command = { id: 'cmd-1', ...data }; commands.push(command); return command; } }
  };
  const ha: any = {
    isConfigured: () => true,
    controlDevice: async () => ({ success: true }),
    controlAccessDevice: async () => ({ success: true })
  };
  const bus: any = { hasKey: () => true, connected: () => true, sendCommand: async () => undefined };
  return { device, updates, commands, prisma, ha, bus };
}

test('unbound device fails closed instead of changing database state', async () => {
  const f = fixture();
  const service = new DeviceControlService(f.prisma, f.ha, f.bus, false);
  await assert.rejects(service.control('light-1', 'on', 'owner'), /not bound/i);
  assert.equal(f.updates.length, 0);
});

test('generic assistant control cannot operate access devices', async () => {
  const f = fixture({ type: 'lock', controlProvider: 'HOME_ASSISTANT', controlTarget: 'lock.front_door' });
  const service = new DeviceControlService(f.prisma, f.ha, f.bus, false);
  await assert.rejects(service.control('light-1', 'unlocked', 'assistant'), /dedicated PIN/i);
});

test('MQTT control creates an approval-gated command rather than claiming completion', async () => {
  const f = fixture({ controlProvider: 'MQTT', controlTarget: 'node-1' });
  const service = new DeviceControlService(f.prisma, f.ha, f.bus, false);
  const result = await service.control('light-1', 'on', 'owner', 'test');
  assert.equal(result.status, 'PENDING_APPROVAL');
  assert.equal(f.commands[0].action, 'set_relay');
  assert.equal(f.commands[0].value, 'true');
  assert.equal(f.updates.at(-1).lastCommandStatus, 'PENDING_APPROVAL');
  assert.equal(f.device.state, 'off');
});

test('simulation can only update state when explicitly enabled', async () => {
  const disabled = fixture({ controlProvider: 'SIMULATION' });
  await assert.rejects(new DeviceControlService(disabled.prisma, disabled.ha, disabled.bus, false).control('light-1', 'on', 'owner'), /disabled/i);

  const enabled = fixture({ controlProvider: 'SIMULATION' });
  const result = await new DeviceControlService(enabled.prisma, enabled.ha, enabled.bus, true).control('light-1', 'on', 'owner');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(enabled.device.state, 'on');
});
