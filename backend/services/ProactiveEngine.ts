import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

/**
 * UJO OS PROACTIVE ENGINE
 * 
 * An autonomous service that runs locally on the Hub.
 * It monitors the database every 60 seconds to detect equipment failure,
 * security breaches, or energy inefficiency without user input.
 */
export class ProactiveEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public init() {
    console.log('🚀 Proactive Intelligence Engine initialized.');

    // 1. Every minute check for energy anomalies
    cron.schedule('* * * * *', async () => {
      await this.checkEnergyAnomalies();
    });

    // 2. Every 5 minutes check for hardware offline status
    cron.schedule('*/5 * * * *', async () => {
      await this.checkDeviceHealth();
    });

    // 3. Every hour, rotate telemetry data (Simulating Time-Series cleanup)
    cron.schedule('0 * * * *', async () => {
      await this.maintenanceCleanup();
    });
  }

  private async checkEnergyAnomalies() {
    console.log('[Engine] Scanning for energy anomalies...');
    
    // Logic: Look for "Heavy" appliances consuming power while on "Inverter"
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    if (config?.powerSource === 'INVERTER' && config?.autoShedding) {
      const heavyOn = await this.prisma.device.findMany({
        where: {
          category: 'HEAVY',
          isSheddable: true,
          state: 'ON',
          status: 'ONLINE'
        }
      });

      for (const device of heavyOn) {
        await this.prisma.alert.create({
          data: {
            type: 'ENERGY',
            severity: 'HIGH',
            message: `Load Shedding Failed: ${device.name} is heavy and still ON during Inverter mode. Force shutting down.`
          }
        });
        
        // AUTO-INTERVENTION: Force shut down
        await this.prisma.device.update({
          where: { id: device.id },
          data: { state: 'OFF', status: 'ANOMALOUS' }
        });
      }
    }
  }

  private async checkDeviceHealth() {
    // Simulates checking if devices are responding back
    console.log('[Engine] Verifying hardware health via MQTT pulse...');
  }

  private async maintenanceCleanup() {
    // Simulates moving data or purging old logs
    const count = await this.prisma.energyTelemetry.count();
    if (count > 10000) {
      console.log('[Engine] Telmetry overflow. Moving data to cold storage (Simulation).');
    }
  }
}
