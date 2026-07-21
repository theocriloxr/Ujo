import type { PrismaClient } from '@prisma/client';
import type { HABridge } from '../../ha_bridge.ts';
import type { HardwareBus } from './mqtt_handler.ts';

export type DeviceControlProvider = 'UNBOUND' | 'SIMULATION' | 'HOME_ASSISTANT' | 'MQTT';

export interface DeviceControlResult {
  accepted: boolean;
  status: 'COMPLETED' | 'SENT' | 'PENDING_APPROVAL';
  deviceId: string;
  provider: DeviceControlProvider;
  desiredState: string;
  commandId?: string;
  message: string;
}

const SIMPLE_ON_OFF_TYPES = new Set(['light', 'switch', 'fan', 'climate', 'appliance', 'pump', 'outlet', 'ha_linked']);
const ACCESS_TYPES = new Set(['lock', 'gate', 'door', 'alarm_control_panel']);

function normalizedProvider(value: unknown): DeviceControlProvider {
  const provider = String(value || 'UNBOUND').toUpperCase();
  return provider === 'SIMULATION' || provider === 'HOME_ASSISTANT' || provider === 'MQTT' ? provider : 'UNBOUND';
}

function normalizedState(deviceType: string, value: string): string {
  const state = value.trim().toLowerCase();
  if (ACCESS_TYPES.has(deviceType.toLowerCase())) {
    if (!['locked', 'unlocked'].includes(state)) throw new Error('Access devices accept only locked or unlocked states.');
    return state;
  }
  if (SIMPLE_ON_OFF_TYPES.has(deviceType.toLowerCase())) {
    if (!['on', 'off'].includes(state)) throw new Error(`${deviceType} devices accept only on or off states.`);
    return state;
  }
  if (!state || state.length > 64) throw new Error('A valid state is required.');
  return state;
}

export class DeviceControlService {
  private readonly prisma: PrismaClient;
  private readonly haBridge: HABridge;
  private readonly hardwareBus: HardwareBus;
  private readonly simulationEnabled: boolean;

  constructor(prisma: PrismaClient, haBridge: HABridge, hardwareBus: HardwareBus, simulationEnabled: boolean) {
    this.prisma = prisma;
    this.haBridge = haBridge;
    this.hardwareBus = hardwareBus;
    this.simulationEnabled = simulationEnabled;
  }

  async bind(deviceId: string, providerValue: unknown, targetValue: unknown) {
    const deviceDelegate = this.prisma.device as any;
    const device = await deviceDelegate.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found.');
    const provider = normalizedProvider(providerValue);
    const target = typeof targetValue === 'string' ? targetValue.trim() : '';

    if (provider === 'SIMULATION' && !this.simulationEnabled) throw new Error('Simulation bindings are disabled.');
    if (provider === 'HOME_ASSISTANT') {
      if (!target.includes('.')) throw new Error('A Home Assistant entity_id is required.');
      if (!this.haBridge.isConfigured()) throw new Error('Home Assistant is not configured.');
    }
    if (provider === 'MQTT') {
      if (!target) throw new Error('A provisioned hardware node id is required.');
      const node = await this.prisma.hardwareNode.findUnique({ where: { id: target } });
      if (!node?.provisioned || !this.hardwareBus.hasKey(target)) throw new Error('The hardware node is not fully provisioned on this hub.');
      if (ACCESS_TYPES.has(String(device.type).toLowerCase()) && node.safetyClass !== 'ACCESS') {
        throw new Error('Access devices must be bound to an ACCESS-class node.');
      }
      if (!ACCESS_TYPES.has(String(device.type).toLowerCase()) && node.safetyClass === 'ACCESS') {
        throw new Error('ACCESS-class nodes cannot be used for generic device control.');
      }
    }

    const updated = await deviceDelegate.update({
      where: { id: deviceId },
      data: {
        controlProvider: provider,
        controlTarget: provider === 'UNBOUND' ? null : target || null,
        desiredState: null,
        lastCommandStatus: 'IDLE',
        lastCommandError: null
      }
    });
    return updated;
  }

  async control(deviceId: string, requestedState: string, actor: string, reason = 'Authenticated dashboard command'): Promise<DeviceControlResult> {
    const deviceDelegate = this.prisma.device as any;
    const device = await deviceDelegate.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found.');
    if (ACCESS_TYPES.has(String(device.type).toLowerCase())) {
      throw new Error('Access devices require the dedicated PIN/access-control workflow.');
    }
    const desiredState = normalizedState(String(device.type), requestedState);
    return this.dispatch(device, desiredState, actor, reason, false);
  }

  async controlAccess(deviceId: string, requestedState: string, actor: string, reason: string): Promise<DeviceControlResult> {
    const deviceDelegate = this.prisma.device as any;
    const device = await deviceDelegate.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Access device not found.');
    if (!ACCESS_TYPES.has(String(device.type).toLowerCase())) throw new Error('The target is not an access device.');
    const desiredState = normalizedState(String(device.type), requestedState);
    return this.dispatch(device, desiredState, actor, reason, true);
  }

  async requestReboot(deviceId: string, actor: string): Promise<DeviceControlResult> {
    const deviceDelegate = this.prisma.device as any;
    const device = await deviceDelegate.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found.');
    const provider = normalizedProvider(device.controlProvider);
    if (provider === 'SIMULATION' && this.simulationEnabled) {
      await deviceDelegate.update({ where: { id: deviceId }, data: { status: 'REBOOTING', lastCommandStatus: 'SENT', lastCommandError: null } });
      setTimeout(() => {
        void deviceDelegate.update({ where: { id: deviceId }, data: { status: 'ONLINE', lastCommandStatus: 'COMPLETED', lastReportedAt: new Date() } });
      }, 3_000);
      return { accepted: true, status: 'SENT', deviceId, provider, desiredState: String(device.state), message: 'Simulation reboot scheduled.' };
    }
    if (provider !== 'MQTT' || !device.controlTarget) throw new Error('This device has no hardware reboot integration.');
    const node = await this.prisma.hardwareNode.findUnique({ where: { id: device.controlTarget } });
    const allowedActions = JSON.parse(node?.allowedActions || '[]') as string[];
    if (!node?.provisioned || !allowedActions.includes('reboot')) throw new Error('The bound node does not allow a reboot command.');
    const command = await this.prisma.hardwareCommand.create({ data: {
      nodeId: node.id,
      action: 'reboot',
      value: null,
      requestedBy: actor,
      reason: 'Authenticated self-heal reboot request; owner approval required.',
      expiresAt: new Date(Date.now() + 5 * 60_000)
    } });
    await deviceDelegate.update({ where: { id: deviceId }, data: { lastCommandStatus: 'PENDING_APPROVAL', lastCommandError: null } });
    return { accepted: true, status: 'PENDING_APPROVAL', deviceId, provider, desiredState: String(device.state), commandId: command.id, message: 'Reboot is waiting for owner approval.' };
  }

  private async dispatch(device: any, desiredState: string, actor: string, reason: string, accessAuthorized: boolean): Promise<DeviceControlResult> {
    const deviceDelegate = this.prisma.device as any;
    const provider = normalizedProvider(device.controlProvider);
    const target = typeof device.controlTarget === 'string' ? device.controlTarget : '';

    if (provider === 'UNBOUND') throw new Error('Device is not bound to Home Assistant or a provisioned Ujo node.');

    if (provider === 'SIMULATION') {
      if (!this.simulationEnabled) throw new Error('Simulation controls are disabled.');
      await deviceDelegate.update({ where: { id: device.id }, data: {
        state: desiredState,
        desiredState: null,
        lastCommandStatus: 'COMPLETED',
        lastCommandError: null,
        lastReportedAt: new Date()
      } });
      return { accepted: true, status: 'COMPLETED', deviceId: device.id, provider, desiredState, message: 'Simulation state updated.' };
    }

    if (provider === 'HOME_ASSISTANT') {
      if (!target) throw new Error('Home Assistant target is missing.');
      if (accessAuthorized) await this.haBridge.controlAccessDevice(target, desiredState);
      else await this.haBridge.controlDevice(target, desiredState);
      await deviceDelegate.update({ where: { id: device.id }, data: {
        desiredState,
        lastCommandStatus: 'SENT',
        lastCommandError: null
      } });
      return { accepted: true, status: 'SENT', deviceId: device.id, provider, desiredState, message: 'Home Assistant accepted the command; reported state will confirm completion.' };
    }

    if (!target) throw new Error('Hardware node target is missing.');
    const node = await this.prisma.hardwareNode.findUnique({ where: { id: target } });
    if (!node?.provisioned || !this.hardwareBus.hasKey(target)) throw new Error('The bound node is not provisioned or has no hub key.');
    const allowedActions = JSON.parse(node.allowedActions || '[]') as string[];
    if (accessAuthorized) throw new Error('Direct MQTT access-control firmware is not certified in this build. Use a supported Home Assistant lock integration.');
    if (node.safetyClass === 'ACCESS' || !allowedActions.includes('set_relay')) throw new Error('The node does not permit generic relay control.');

    const command = await this.prisma.hardwareCommand.create({ data: {
      nodeId: target,
      action: 'set_relay',
      value: desiredState === 'on' ? 'true' : 'false',
      requestedBy: actor,
      reason: reason.trim().slice(0, 500),
      expiresAt: new Date(Date.now() + 5 * 60_000)
    } });
    await deviceDelegate.update({ where: { id: device.id }, data: {
      desiredState,
      lastCommandStatus: 'PENDING_APPROVAL',
      lastCommandError: null
    } });
    return { accepted: true, status: 'PENDING_APPROVAL', deviceId: device.id, provider, desiredState, commandId: command.id, message: 'Hardware command is waiting for owner approval.' };
  }
}
