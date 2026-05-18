import mqtt from 'mqtt';

/**
 * UJO OS: VIRTUAL HOUSE SIMULATOR
 * This script pretends to be the physical hardware (ESP32s).
 * It generates grid surges, gas leaks, and motion events to test the Brain.
 */
function startSimulation() {
  const brokerUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
  const client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 10000, // Very slow retry for simulation
  });

  let hasLoggedError = false;

  client.on('error', (err) => {
    if (!hasLoggedError) {
      console.warn('🏘️  VIRTUAL HOUSE: Simulated Hardware link suspended (No local broker).');
      hasLoggedError = true;
    }
  });

  let gridVoltage = 220;
  let fridgeEthylene = 10;
  let motionCount = 0;

  client.on('connect', () => {
    console.log('🏘️  VIRTUAL HOUSE: Online and publishing data...');

    setInterval(() => {
      // 1. Simulate Grid Fluctuation
      // Occasionally spike voltage to test protection
      const chance = Math.random();
      if (chance > 0.95) {
        gridVoltage = 271; // Surging
      } else if (chance < 0.05) {
        gridVoltage = 165; // Brownout
      } else {
        gridVoltage = 220 + (Math.random() * 10 - 5); // Normal noise
      }

      // 2. Simulate Ethylene accumulation (decay)
      fridgeEthylene += 0.2; 
      if (fridgeEthylene > 100) fridgeEthylene = 10; // Reset after peak

      // 3. Publish Data
      client.publish('ujo/power/grid', JSON.stringify({ 
        voltage: Math.round(gridVoltage),
        source: 'MAINS',
        reactive_power: Math.round(Math.random() * 200),
        power_factor: (0.85 + Math.random() * 0.15).toFixed(2),
        current: (5 + Math.random() * 5).toFixed(1)
      }));

      client.publish('ujo/sensors/fridge', JSON.stringify({ 
        gas: Math.round(fridgeEthylene) 
      }));

      if (Math.random() > 0.8) {
        client.publish('ujo/sensors/livingroom', JSON.stringify({ 
          motion: true 
        }));
      }

      console.log(`[VIRTUAL HOUSE] Emitted Pulse -> Voltage: ${Math.round(gridVoltage)}V, Ethylene: ${Math.round(fridgeEthylene)}ppm`);

    }, 5000); // 5-second heart beat
  });
}

// Check if running as main
if (process.argv[1].includes('virtual_house')) {
  startSimulation();
}

export { startSimulation };
