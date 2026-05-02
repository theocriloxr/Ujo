import mqtt from 'mqtt';
import { DecisionEngine } from './DecisionEngine.ts';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

export function setupMQTT(io: Server, prisma: PrismaClient) {
  const brain = new DecisionEngine(prisma);
  const client = mqtt.connect('mqtt://localhost:1883'); // Standard MQTT port

  client.on('error', (err) => {
    console.error('MQTT Connection Error:', err.message);
    // Do not crash the process, just stay disconnected
  });

  client.on('connect', () => {
    console.log('📡 Hub connected to MQTT Broker (Ready for ESP32/Simulation)');
    client.subscribe('ujo/sensors/#');
    client.subscribe('ujo/power/#');
  });

  client.on('message', async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      const location = topic.split('/')[2] || 'unknown';

      // 1. Construct context for the Brain
      const context = {
        location: location,
        motion: data.motion || false,
        gasLevel: data.gas || 0,
        voltage: data.voltage || 220,
        powerSource: data.source || 'MAINS'
      };

      // 2. Feed to Decision Engine
      const interventions = await brain.evaluateContext(context);

      // 3. Update Real-time HUD (Frontend)
      io.emit('sensor_update', { topic, data });

      if (interventions.length > 0) {
        interventions.forEach(action => {
          io.emit('trust_log_update', { 
            id: Date.now().toString(),
            message: action,
            timestamp: new Date().toISOString(),
            type: 'system' 
          });
        });
      }

      // 4. Persistence for Recharts
      if (data.voltage) {
        await prisma.energyTelemetry.create({
          data: {
            voltage: data.voltage,
            current: data.current || 0,
            frequency: 50,
            source: context.powerSource
          }
        });
      }

    } catch (err) {
      console.error('MQTT Parsing Error:', err);
    }
  });

  return client;
}
