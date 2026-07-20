import mqtt from 'mqtt';
import { signEnvelope, type HardwareEnvelope } from './src/services/hardwareProtocol.ts';

const SIM_SECRET = process.env.UJO_SIM_NODE_SECRET || 'ujo-development-simulator-secret-32chars';
const sequences = new Map<string, number>();

export function createSimulatedEnvelope(nodeId: string, payload: Record<string, unknown>, timestamp = Math.floor(Date.now() / 1000)): HardwareEnvelope {
  const seq = (sequences.get(nodeId) ?? 0) + 1;
  sequences.set(nodeId, seq);
  const unsigned = { v: 1 as const, nodeId, seq, timestamp, type: 'telemetry' as const, payload };
  return { ...unsigned, signature: signEnvelope(unsigned, SIM_SECRET) };
}

function startSimulation() {
  const brokerUrl = process.env.MQTT_BROKER || 'mqtt://127.0.0.1:1883';
  const client = mqtt.connect(brokerUrl, { reconnectPeriod: 10_000 });
  let hasLoggedError = false;
  let fridgeEthylene = 10;

  client.on('error', () => {
    if (!hasLoggedError) {
      console.warn('Virtual hardware suspended because the MQTT broker is unavailable.');
      hasLoggedError = true;
    }
  });

  const publish = (nodeId: string, payload: Record<string, unknown>) => {
    client.publish(`ujo/v1/nodes/${nodeId}/telemetry`, JSON.stringify(createSimulatedEnvelope(nodeId, payload)), { qos: 1 });
  };

  client.on('connect', () => {
    console.log('Virtual hardware test rig online.');
    setInterval(() => {
      const chance = Math.random();
      const voltage = chance > 0.95 ? 271 : chance < 0.05 ? 165 : 220 + (Math.random() * 10 - 5);
      fridgeEthylene = fridgeEthylene > 100 ? 10 : fridgeEthylene + 0.2;
      publish('ujo-grid-sim', {
        kind: 'energy', room: 'Utility', voltage: Math.round(voltage), source: 'MAINS',
        reactivePower: Math.round(Math.random() * 200), powerFactor: Number((0.85 + Math.random() * 0.15).toFixed(2)),
        current: Number((5 + Math.random() * 5).toFixed(1)), frequency: 50
      });
      publish('ujo-kitchen-sim', {
        kind: 'food-environment', room: 'Kitchen', ethylenePpm: Math.round(fridgeEthylene), temperatureC: 4.1, humidityPct: 72
      });
      publish('ujo-tank-sim', {
        kind: 'water', room: 'Utility', tankLevelPct: 64, pumpRunning: false, flowLitresMinute: 0
      });
      if (Math.random() > 0.8) publish('ujo-presence-sim', { kind: 'presence', room: 'Living Room', motion: true, presence: true });
    }, 5_000);
  });
}

if (process.argv[1]?.includes('virtual_house')) startSimulation();

export { startSimulation };
