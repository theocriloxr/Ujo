import { PrismaClient } from '@prisma/client';

export interface HouseContext {
  location: string;
  motion: boolean;
  gasLevel: number;
  voltage: number;
  powerSource: string;
}

export class DecisionEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Evaluates the current state of the house and returns a list of corrective actions.
   */
  public async evaluateContext(context: HouseContext): Promise<string[]> {
    const actions: string[] = [];

    // 1. THE GRID GUARDIAN: Voltage protection
    if (context.voltage > 260) {
      actions.push("CRITICAL: Grid Surge detected (>260V). Protecting sensitive electronics.");
      // In production, this would trigger Matter/Relay shutoffs
    } else if (context.voltage < 180 && context.powerSource === 'MAINS') {
      actions.push("WARNING: Grid Brownout detected (<180V). Emitting shutoff command to Fridge Relay to protect compressor.");
    }

    // 2. FOOD INTELLIGENCE: Ethylene monitoring
    if (context.gasLevel > 50) {
      actions.push("SPOILAGE ALERT: High Ethylene levels detected in Kitchen Fridge. Food ripening/decay accelerating.");
    }

    // 3. SECURITY: Spatial Presence
    if (context.motion && context.location === 'livingroom') {
      // Logic for "Voice Anchoring" or "Ghosting Resolution" could go here
      // actions.push("Presence confirmed in Living Room. Aligning UI context.");
    }

    // Log the evaluation to Audit Log
    if (actions.length > 0) {
      await this.prisma.auditLog.create({
        data: {
          action: 'DECISION_ENGINE_INTERVENTION',
          actor: 'UJO_BRAIN',
          meta: JSON.stringify({ context, actions })
        }
      });
    }

    return actions;
  }
}
