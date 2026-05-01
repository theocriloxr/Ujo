import { PrismaClient } from '@prisma/client';

export class ConversationEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async saveContext(residentId: string, context: any): Promise<void> {
    await this.prisma.conversationMemory.create({
      data: {
        residentId,
        context
      }
    });
  }

  async getContext(residentId: string): Promise<any> {
    const memories = await this.prisma.conversationMemory.findMany({
      where: { residentId },
      orderBy: { timestamp: 'desc' },
      take: 5
    });
    return memories.map(m => m.context);
  }

  async explainAction(actionId: string): Promise<string> {
    // Sim explain
    return 'Action triggered by energy anomaly detection: voltage < 180V, inverter mode active, auto-shed policy.';
  }

  async preArrivalMode(residentId: string): Promise<void> {
    // Sim
    console.log(`Pre-arrival for ${residentId}: AC on, lights prep`);
  }
}

