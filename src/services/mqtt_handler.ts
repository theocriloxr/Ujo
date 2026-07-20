import fs from 'node:fs';
import mqtt from 'mqtt';
import { DecisionEngine } from './DecisionEngine.ts';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { HardwareReplayGuard, parseNodeKeys, type HardwareEnvelope } from './hardwareProtocol.ts';
import { signEnvelope } from './hardwareProtocol.ts';

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
          await prisma.hardwareCommand.updateMany({
            where: { id: commandId, nodeId: envelope.nodeId, status: 'SENT' },
            data: {
              status: success ? 'COMPLETED' : 'FAILED',
              completedAt: new Date(),
              error: success ? null : String(payload.message || 'Node rejected command')
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
    async sendCommand(commandId: string, nodeId: string, action: string, value?: string) {
      const secret = nodeKeys.get(nodeId);
      if (!secret) throw new Error('Node is not provisioned on this hub.');
      const node = await prisma.$transaction(async transaction => {
        const existing = await transaction.hardwareNode.findUnique({ where: { id: nodeId } });
        if (!existing) throw new Error('Hardware node has not checked in.');
        return transaction.hardwareNode.update({
          where: { id: nodeId },
          data: { commandSequence: { increment: 1 } }
        });
      });
      const commandValue = action === 'set_relay' ? value === 'true' : value;
      const payload = { commandId, action, value: commandValue };
      const unsigned = {
        v: 1 as const,
        nodeId,
        seq: node.commandSequence,
        timestamp: Math.floor(Date.now() / 1000),
        type: 'command' as const,
        payload
      };
      const envelope = { ...unsigned, signature: signEnvelope(unsigned, secret) };
      const topic = `ujo/v1/nodes/${nodeId}/command`;
      await new Promise<void>((resolve, reject) => {
        client.publish(topic, JSON.stringify(envelope), { qos: 1 }, error => error ? reject(error) : resolve());
      });
    }
  } satisfies HardwareBus;
}
