import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { assessMaintenance } from './InfrastructureIntelligence.ts';

export class ProactiveEngine {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  init() {
    console.log('Proactive deterministic monitoring initialized.');
    cron.schedule('* * * * *', () => this.runEnergyAudit().catch(error => console.error('Energy audit failed:', error)));
    cron.schedule('*/5 * * * *', () => this.runHardwareHealthAudit().catch(error => console.error('Hardware audit failed:', error)));
    cron.schedule('15 * * * *', () => this.runMaintenanceAudit().catch(error => console.error('Maintenance audit failed:', error)));
    cron.schedule('0 3 * * *', () => this.runRetentionCleanup().catch(error => console.error('Retention cleanup failed:', error)));
  }

  async runEnergyAudit() {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    if (config?.powerSource !== 'INVERTER' || !config.autoShedding) return;
    const heavyOn = await this.prisma.device.findMany({
      where: { category: 'HEAVY', isSheddable: true, state: { in: ['ON', 'on'] }, status: 'ONLINE' }
    });
    for (const device of heavyOn) {
      const marker = `[LOAD:${device.id}]`;
      const existing = await this.prisma.alert.findFirst({ where: { type: 'ENERGY', acknowledged: false, message: { contains: marker } } });
      if (!existing) await this.prisma.alert.create({ data: {
        type: 'ENERGY', severity: 'HIGH',
        message: `${marker} ${device.name} remains on while inverter load shedding is active. Physical state must be confirmed.`
      } });
    }
  }

  async runHardwareHealthAudit(now = new Date()) {
    const staleBefore = new Date(now.getTime() - 5 * 60_000);
    const staleNodes = await this.prisma.hardwareNode.findMany({
      where: { provisioned: true, status: { not: 'OFFLINE' }, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }] }
    });
    for (const node of staleNodes) {
      await this.prisma.hardwareNode.update({ where: { id: node.id }, data: { status: 'OFFLINE' } });
      const marker = `[NODE:${node.id}]`;
      const existing = await this.prisma.alert.findFirst({ where: { type: 'HARDWARE', acknowledged: false, message: { contains: marker } } });
      if (!existing) await this.prisma.alert.create({ data: { type: 'HARDWARE', severity: node.safetyClass === 'CRITICAL' ? 'HIGH' : 'MEDIUM', message: `${marker} Hardware heartbeat is overdue.` } });
    }
  }

  async runMaintenanceAudit(now = new Date()) {
    const assets = await this.prisma.maintenanceAsset.findMany();
    for (const asset of assets) {
      const assessment = assessMaintenance({ ...asset, measuredHealthScore: asset.healthScore, now });
      if (asset.status !== assessment.status || asset.healthScore !== assessment.healthScore) {
        await this.prisma.maintenanceAsset.update({ where: { id: asset.id }, data: { status: assessment.status, healthScore: assessment.healthScore } });
      }
      if (assessment.status !== 'HEALTHY') {
        const marker = `[ASSET:${asset.id}]`;
        const existing = await this.prisma.alert.findFirst({ where: { type: 'MAINTENANCE', acknowledged: false, message: { contains: marker } } });
        if (!existing) await this.prisma.alert.create({ data: {
          type: 'MAINTENANCE', severity: assessment.status === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          message: `${marker} ${asset.name} requires service review.`
        } });
      }
    }
  }

  async runRetentionCleanup(now = new Date()) {
    const rawDays = Number.parseInt(process.env.TELEMETRY_RETENTION_DAYS || '90', 10);
    const retentionDays = Number.isFinite(rawDays) ? Math.max(7, Math.min(3650, rawDays)) : 90;
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    await this.prisma.$transaction([
      this.prisma.sensorTelemetry.deleteMany({ where: { timestamp: { lt: cutoff } } }),
      this.prisma.energyTelemetry.deleteMany({ where: { timestamp: { lt: cutoff } } }),
      this.prisma.waterReading.deleteMany({ where: { timestamp: { lt: cutoff } } }),
      this.prisma.foodZoneReading.deleteMany({ where: { timestamp: { lt: cutoff } } })
    ]);
  }
}
