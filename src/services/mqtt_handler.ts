import fs from 'node:fs';
import mqtt from 'mqtt';
import { DecisionEngine } from './DecisionEngine.ts';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { HardwareReplayGuard, parseNodeKeys, type HardwareEnvelope } from './hardwareProtocol.ts';
import { signEnvelope } from './hardwareProtocol.ts';
import { assessMaintenance, assessWater } from './InfrastructureIntelligence.ts';
import { planEnergySafety } from './EnergyOrchestrator.ts';
import { AutomationEngine } from './AutomationEngine.ts';

export interface HardwareBus {
  connected(): boolean;
  hasKey(nodeId: string): boolean;
  sendCommand(commandId: string, nodeId: string, action: string, value?: string): Promise<void>;
}

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function setupMQTT(io: Server, prisma: PrismaClient) {
  const brain = new DecisionEngine(prisma);
  const automations = new AutomationEngine(prisma);
  const brokerUrl = process.env.MQTT_BROKER || 'mqtt://127.0.0.1:1883';
  const nodeKeys = parseNodeKeys(process.env.UJO_NODE_KEYS_JSON);
  if (process.env.NODE_ENV !== 'production') {
    const simulatorSecret = process.env.UJO_SIM_NODE_SECRET || 'ujo-development-simulator-secret-32chars';
    for (const id of ['ujo-grid-sim', 'ujo-kitchen-sim', 'ujo-tank-sim', 'ujo-presence-sim']) nodeKeys.set(id, simulatorSecret);
  }
  const replayGuard = new HardwareReplayGuard();
  const caPath = process.env.MQTT_CA_PATH;
  const client = mqtt.connect(brokerUrl, {
    clientId: `ujo-hub-${process.pid}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    ca: caPath && fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined,
    rejectUnauthorized: brokerUrl.startsWith('mqtts://'),
    reconnectPeriod: 5_000,
    connectTimeout: 30_000,
    clean: false,
  });

  let connectionLogged = false;
  client.on('error', () => {
    if (!connectionLogged) {
      console.warn('MQTT broker unavailable; deterministic hub controls remain active.');
      connectionLogged = true;
    }
  });

  client.on('connect', () => {
    console.log('Ujo hardware bus connected.');
    connectionLogged = true;
    client.subscribe('ujo/v1/nodes/+/telemetry', { qos: 1 });
    client.subscribe('ujo/v1/nodes/+/status', { qos: 1 });
    client.subscribe('ujo/v1/nodes/+/ack', { qos: 1 });
    if (process.env.ALLOW_LEGACY_MQTT === 'true') {
      client.subscribe('ujo/sensors/#');
      client.subscribe('ujo/power/#');
    }
  });

  const sendHardwareCommand = async (commandId: string, nodeId: string, action: string, value?: string) => {
    const secret = nodeKeys.get(nodeId);
    if (!secret) throw new Error('Node is not provisioned on this hub.');
    const node = await prisma.$transaction(async transaction => {
      const existing = await transaction.hardwareNode.findUnique({ where: { id: nodeId } });
      if (!existing) throw new Error('Hardware node has not checked in.');
      return transaction.hardwareNode.update({ where: { id: nodeId }, data: { commandSequence: { increment: 1 } } });
    });
    const commandValue = action === 'set_relay' ? value === 'true' : value;
    const payload = { commandId, action, value: commandValue };
    const unsigned = { v: 1 as const, nodeId, seq: node.commandSequence, timestamp: Math.floor(Date.now() / 1000), type: 'command' as const, payload };
    const envelope = { ...unsigned, signature: signEnvelope(unsigned, secret) };
    await new Promise<void>((resolve, reject) => {
      client.publish(`ujo/v1/nodes/${nodeId}/command`, JSON.stringify(envelope), { qos: 1 }, error => error ? reject(error) : resolve());
    });
  };

  const requestProtectiveOff = async (nodeId: string, reason: string, requestedBy: string) => {
    if (!client.connected) return;
    const node = await prisma.hardwareNode.findUnique({ where: { id: nodeId } });
    const allowed = node?.provisioned && node.safetyClass === 'CRITICAL' && (JSON.parse(node.allowedActions || '[]') as string[]).includes('set_relay');
    if (!allowed) return;
    const active = await prisma.hardwareCommand.findFirst({ where: {
      nodeId, requestedBy, status: { in: ['APPROVING', 'SENT'] }, createdAt: { gte: new Date(Date.now() - 5 * 60_000) }
    } });
    if (active) return;
    const command = await prisma.hardwareCommand.create({ data: {
      nodeId, action: 'set_relay', value: 'false', status: 'APPROVING', requestedBy, reason,
      expiresAt: new Date(Date.now() + 60_000), approvedAt: new Date()
    } });
    try {
      await sendHardwareCommand(command.id, command.nodeId, command.action, command.value ?? undefined);
      await prisma.hardwareCommand.update({ where: { id: command.id }, data: { status: 'SENT' } });
    } catch (error) {
      await prisma.hardwareCommand.update({ where: { id: command.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message : 'Protective stop failed.' } });
    }
  };

  const processPayload = async (nodeId: string, data: Record<string, unknown>, timestamp = new Date()) => {
    const location = String(data.room || nodeId);
    const context = {
      location,
      motion: Boolean(data.motion),
      gasLevel: numberValue(data.ethylenePpm ?? data.gas),
      voltage: numberValue(data.voltage, 220),
      powerSource: String(data.source || 'MAINS')
    };
    const interventions = await brain.evaluateContext(context);
    io.emit('sensor_update', { nodeId, data, timestamp });
    interventions.forEach(action => io.emit('trust_log_update', {
      id: `${nodeId}-${Date.now()}`,
      message: action,
      timestamp: timestamp.toISOString(),
      type: 'system'
    }));

    await prisma.sensorTelemetry.create({
      data: { nodeId, kind: String(data.kind || 'environment'), payload: JSON.stringify(data), timestamp }
    });
    if (data.kind === 'food-environment') {
      await prisma.foodZoneReading.create({
        data: {
          nodeId,
          location,
          temperature: data.temperatureC === undefined ? null : numberValue(data.temperatureC),
          humidity: data.humidityPct === undefined ? null : numberValue(data.humidityPct),
          ethylenePpm: data.ethylenePpm === undefined ? null : numberValue(data.ethylenePpm),
          vocIndex: data.vocIndex === undefined ? null : numberValue(data.vocIndex),
          timestamp
        }
      });
    }
    if (data.kind === 'water') {
      const tank = await prisma.waterTank.findUnique({ where: { nodeId } });
      if (tank) {
        const levelPct = numberValue(data.tankLevelPct);
        const flowLitresMinute = data.flowLitresMinute === undefined ? null : numberValue(data.flowLitresMinute);
        const pumpRunning = Boolean(data.pumpRunning);
        const leakDetected = Boolean(data.leakDetected);
        const assessment = assessWater({ levelPct, lowLevelPct: tank.lowLevelPct, highLevelPct: tank.highLevelPct, pumpRunning, flowLitresMinute, leakDetected });
        await prisma.$transaction([
          prisma.waterReading.create({ data: { tankId: tank.id, levelPct, flowLitresMinute, pumpRunning, leakDetected, timestamp } }),
          prisma.waterTank.update({ where: { id: tank.id }, data: { currentLevelPct: levelPct, status: assessment.status, lastSeenAt: timestamp } })
        ]);
        for (const alert of assessment.alerts) {
          const marker = `[${alert.code}]`;
          const existing = await prisma.alert.findFirst({ where: { type: 'WATER', acknowledged: false, message: { contains: marker } } });
          if (!existing) await prisma.alert.create({ data: { type: 'WATER', severity: alert.severity, message: `${marker} ${tank.name}: ${alert.message}` } });
        }
        if (assessment.protectiveAction === 'STOP_PUMP' && tank.pumpNodeId) {
          await requestProtectiveOff(tank.pumpNodeId, `Protective ${assessment.protectiveAction}`, 'deterministic-water-safety');
        }
      }
    }
    if (data.kind === 'energy') {
      const source = ['MAINS', 'INVERTER', 'GENERATOR', 'SOLAR'].includes(String(data.source)) ? String(data.source) as 'MAINS' | 'INVERTER' | 'GENERATOR' | 'SOLAR' : 'MAINS';
      const voltage = numberValue(data.voltage);
      const totalWatts = data.totalWatts === undefined
        ? voltage * numberValue(data.current) * numberValue(data.powerFactor, 1)
        : numberValue(data.totalWatts);
      const batteryPct = data.batteryPct === undefined ? null : numberValue(data.batteryPct);
      const policy = await prisma.energyPolicy.upsert({ where: { id: 'GLOBAL' }, update: {}, create: { id: 'GLOBAL' } });
      await prisma.powerSnapshot.create({ data: {
        source, voltage, totalWatts, batteryPct, solarWatts: data.solarWatts === undefined ? null : numberValue(data.solarWatts), timestamp
      } });
      await prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { powerSource: source } });
      const energyLoads = await prisma.energyLoad.findMany({ where: { enabled: true } });
      const devices = await prisma.device.findMany({ where: { id: { in: energyLoads.map(load => load.deviceId) } } });
      const stateById = new Map(devices.map(device => [device.id, device.state.toLowerCase()]));
      const plan = planEnergySafety({
        source, voltage, batteryPct, totalWatts,
        minimumMainsVoltage: policy.minimumMainsVoltage, maximumMainsVoltage: policy.maximumMainsVoltage,
        inverterReservePct: policy.inverterReservePct, inverterMaxWatts: policy.inverterMaxWatts, generatorMaxWatts: policy.generatorMaxWatts
      }, energyLoads.map(load => ({
        id: load.id, name: load.name, priority: load.priority, ratedWatts: load.ratedWatts,
        sheddable: load.sheddable, compressorLoad: load.compressorLoad, isOn: stateById.get(load.deviceId) === 'on'
      })));
      for (const message of plan.alerts) {
        const marker = '[ENERGY-POLICY]';
        const existing = await prisma.alert.findFirst({ where: { type: 'ENERGY', acknowledged: false, message: { contains: message } } });
        if (!existing) await prisma.alert.create({ data: { type: 'ENERGY', severity: plan.isolateMains ? 'CRITICAL' : 'HIGH', message: `${marker} ${message}` } });
      }
      if (policy.automaticProtection) {
        if (plan.isolateMains && policy.mainsContactorNodeId) {
          await requestProtectiveOff(policy.mainsContactorNodeId, 'Unsafe mains voltage isolation', 'deterministic-energy-safety');
        }
        for (const item of plan.shed) {
          const load = energyLoads.find(candidate => candidate.id === item.loadId);
          if (load?.hardwareNodeId) await requestProtectiveOff(load.hardwareNodeId, item.reason, 'deterministic-energy-safety');
        }
      }
    }
    if (data.relayState !== undefined) {
      const reported = Boolean(data.relayState) ? 'on' : 'off';
      await (prisma.device as any).updateMany({
        where: { controlProvider: 'MQTT', controlTarget: nodeId },
        data: {
          state: reported,
          desiredState: null,
          lastCommandStatus: 'COMPLETED',
          lastCommandError: null,
          lastReportedAt: timestamp,
          status: 'ONLINE'
        }
      });
    }
    if (data.assetRuntimeHours !== undefined) {
      const runtimeHours = numberValue(data.assetRuntimeHours);
      const assets = await prisma.maintenanceAsset.findMany({ where: { nodeId } });
      for (const asset of assets) {
        if (runtimeHours < asset.runtimeHours) continue;
        const assessment = assessMaintenance({
          ...asset,
          runtimeHours,
          measuredHealthScore: data.healthScore === undefined ? asset.healthScore : numberValue(data.healthScore)
        });
        await prisma.maintenanceAsset.update({ where: { id: asset.id }, data: {
          runtimeHours, healthScore: assessment.healthScore, status: assessment.status
        } });
        if (assessment.status !== 'HEALTHY') {
          const marker = `[ASSET:${asset.id}]`;
          const existing = await prisma.alert.findFirst({ where: { type: 'MAINTENANCE', acknowledged: false, message: { contains: marker } } });
          if (!existing) await prisma.alert.create({ data: {
            type: 'MAINTENANCE', severity: assessment.status === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            message: `${marker} ${asset.name} is ${assessment.status.toLowerCase().replace('_', ' ')}.`
          } });
        }
      }
    }
    await automations.handleEvent('SENSOR_THRESHOLD', data);
    if (data.kind === 'presence') await automations.handleEvent('PRESENCE', { ...data, present: Boolean(data.presence ?? data.motion) });
    if (data.kind === 'energy') await automations.handleEvent('POWER_SOURCE', { ...data, source: context.powerSource });
    if (data.voltage !== undefined) {
      await prisma.energyTelemetry.create({
        data: {
          voltage: numberValue(data.voltage),
          current: numberValue(data.current),
          frequency: numberValue(data.frequency, 50),
          reactivePower: numberValue(data.reactivePower ?? data.reactive_power),
          powerFactor: numberValue(data.powerFactor ?? data.power_factor, 1),
          source: context.powerSource
        }
      });
    }
  };

  client.on('message', async (topic, message) => {
    try {
      if (!topic.startsWith('ujo/v1/nodes/')) {
        if (process.env.ALLOW_LEGACY_MQTT !== 'true') return;
        const data = JSON.parse(message.toString()) as Record<string, unknown>;
        await processPayload(`legacy-${topic.split('/')[2] || 'unknown'}`, data);
        return;
      }

      const envelope = JSON.parse(message.toString()) as HardwareEnvelope;
      const topicNodeId = topic.split('/')[3];
      if (topicNodeId !== envelope.nodeId) throw new Error('topic-node-mismatch');
      const secret = nodeKeys.get(envelope.nodeId);
      if (!secret) throw new Error('unprovisioned-node');
      const persisted = await prisma.hardwareNode.findUnique({ where: { id: envelope.nodeId } });
      if (persisted && envelope.seq <= persisted.lastSequence) throw new Error('persisted-replay');
      const verification = replayGuard.verify(envelope, secret);
      if (!verification.valid) throw new Error(verification.reason);

      const payload = envelope.payload as Record<string, unknown>;
      const timestamp = new Date(envelope.timestamp * 1000);
      await prisma.hardwareNode.upsert({
        where: { id: envelope.nodeId },
        update: {
          status: 'ONLINE',
          lastSequence: envelope.seq,
          lastSeenAt: timestamp,
          firmwareVersion: typeof payload.firmwareVersion === 'string' ? payload.firmwareVersion : undefined
        },
        create: {
          id: envelope.nodeId,
          kind: String(payload.nodeKind || payload.kind || 'generic'),
          room: typeof payload.room === 'string' ? payload.room : null,
          firmwareVersion: typeof payload.firmwareVersion === 'string' ? payload.firmwareVersion : null,
          status: 'ONLINE',
          lastSequence: envelope.seq,
          lastSeenAt: timestamp
        }
      });
      if (envelope.type === 'telemetry') await processPayload(envelope.nodeId, payload, timestamp);
      if (envelope.type === 'ack') {
        const commandId = typeof payload.commandId === 'string' ? payload.commandId : '';
        const success = payload.success === true;
        if (commandId) {
          const command = await prisma.hardwareCommand.findFirst({ where: { id: commandId, nodeId: envelope.nodeId } });
          await prisma.hardwareCommand.updateMany({
            where: { id: commandId, nodeId: envelope.nodeId, status: 'SENT' },
            data: {
              status: success ? 'COMPLETED' : 'FAILED',
              completedAt: new Date(),
              error: success ? null : String(payload.message || 'Node rejected command')
            }
          });
          const reportedState = command?.action === 'set_relay'
            ? (command.value === 'true' ? 'on' : 'off')
            : undefined;
          await (prisma.device as any).updateMany({
            where: { controlProvider: 'MQTT', controlTarget: envelope.nodeId },
            data: {
              state: success && reportedState ? reportedState : undefined,
              desiredState: success ? null : undefined,
              lastCommandStatus: success ? 'COMPLETED' : 'FAILED',
              lastCommandError: success ? null : String(payload.message || 'Node rejected command'),
              lastReportedAt: new Date(),
              status: success ? 'ONLINE' : 'DEGRADED'
            }
          });
        }
        io.emit('hardware_ack', { nodeId: envelope.nodeId, ...payload });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid-message';
      console.warn(`[MQTT] Rejected ${topic}: ${reason}`);
    }
  });

  return {
    connected: () => client.connected,
    hasKey: (nodeId: string) => nodeKeys.has(nodeId),
    sendCommand: sendHardwareCommand
  } satisfies HardwareBus;
}
