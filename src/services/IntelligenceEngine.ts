import { PrismaClient, Prisma } from '@prisma/client';
import { JsonObject } from '@prisma/client/runtime/library';


export class IntelligenceEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

async getErrandSuggestions(residentId: string): Promise<any[]> {
  // Sim for now - new model
  return [
    { item: 'Milk', confidence: 0.85, message: 'Low on Milk (conf: 85%)' },
    { item: 'Eggs', confidence: 0.92, message: 'Low on Eggs (conf: 92%)' }
  ];
}

  async predictDeviceHealth(deviceId: string): Promise<any> {
    const trends = await this.prisma.healthTrend.findMany({
      where: { deviceId }
    });

    if (trends.length < 7) return { trend: 0, confidence: 0, anomaly: false };

    const avgTrend = trends.slice(-7).reduce((sum, t) => sum + t.trend, 0) / 7;
    const confidence = Math.min(1, trends.length / 30); // More data = higher conf

    return {
      trend: avgTrend,
      confidence,
      anomaly: avgTrend > 0.3 && confidence > 0.8, // Spike + reliable data
      message: avgTrend > 0.3 ? 'Increased power draw detected - check?' : 'Normal'
    };
  }

  async checkTheftAnomaly(deviceId: string, movement: any): Promise<boolean> {
    // Sim anomaly detection
    const isAnomaly = movement.distance > 50 && movement.speed > 2; // Meters, m/s
    if (isAnomaly) {
      // Log to alert
      await this.prisma.alert.create({
        data: {
          type: 'THEFT',
          severity: 'HIGH',
          message: `Suspicious movement: Item ${deviceId} left boundary (dist:${movement.distance}m)`
        }
      });
    }
    return isAnomaly;
  }

  async calculateHouseScore(): Promise<number> {
    // Aggregate metrics
    const devices = await this.prisma.device.count({ where: { status: 'ONLINE' } });
    const alerts = await this.prisma.alert.count({ where: { acknowledged: false } });
    const trends = await this.prisma.healthTrend.count({ where: { anomaly: true } });

    const totalDevices = 10; // Assume
    return Math.max(0, 100 - (alerts * 10 + trends * 5 + (totalDevices - devices) * 5));
  }
}

