// --- UJO OS: DISTRIBUTED DECISION ENGINE ---
// This handles Context, Rules, execution, and Trust Logging.

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ActionLog {
  id: string;
  timestamp: string;
  actionTaken: string;
  reason: string; // The "Trust & Control" explanation
  priority: Priority;
  requiresHITL: boolean; // Human-In-The-Loop required?
}

export interface Rule {
  id: string;
  name: string;
  priority: Priority;
  // Evaluates the current state to see if rule applies
  condition: (context: any) => boolean; 
  // Executes the logic or returns an alert for the user
  execute: (context: any) => ActionLog; 
}

export class UjoDecisionEngine {
  private rules: Rule[] = [];
  public actionHistory: ActionLog[] = [];

  constructor() {
    this.registerCoreRules();
  }

  // --- THE RULES (The "FRIDAY" Layer) ---
  private registerCoreRules() {
    // Rule 1: The Grid Guardian
    this.rules.push({
      id: 'rule_grid_guardian',
      name: 'Dynamic Load Shedding',
      priority: 'Critical',
      condition: (ctx) => ctx.powerSource === 'Inverter' && ctx.heavyLoadsActive > 0,
      execute: (ctx) => {
        // Logic: Turn off ACs and Pumps
        return {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          actionTaken: 'Deactivated All Heavy Loads (AC, Water Pump)',
          reason: 'Grid failure detected. Switched to Inverter to prevent battery capsize.',
          priority: 'Critical' as Priority,
          requiresHITL: false // Auto-execute, safety critical
        };
      }
    });

    // Rule 2: Food Intelligence (Spoilage Prediction)
    this.rules.push({
      id: 'rule_food_spoilage',
      name: 'Ethylene Gas Spoilage Monitor',
      priority: 'Medium',
      condition: (ctx) => ctx.fridgeEthyleneLevel > 80 && ctx.fridgeTemperature > 4,
      execute: (ctx) => {
        return {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          actionTaken: 'Generated Spoilage Warning',
          reason: `Ethylene gas spiked to ${ctx.fridgeEthyleneLevel}ppm. Tomatoes likely to spoil in 24hrs.`,
          priority: 'Medium' as Priority,
          requiresHITL: true // Ask user before ordering replacements
        };
      }
    });

    // Rule 3: Dry-Run Borehole Protection
    this.rules.push({
      id: 'rule_borehole_safety',
      name: 'Dry-Run Motor Protection',
      priority: 'High',
      condition: (ctx) => ctx.pumpActive && ctx.waterFlowRate === 0 && ctx.pumpRunTimeMins > 5,
      execute: (ctx) => {
        return {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          actionTaken: 'Emergency Shutoff: Borehole Pump',
          reason: 'Pump drew power for 5 mins but no water flow detected. Shut off to prevent motor burnout.',
          priority: 'High' as Priority,
          requiresHITL: false
        };
      }
    });
  }

  // The main loop that runs every time sensor data changes
  public evaluateContext(currentContext: any): ActionLog[] | null {
    const actionsTaken: ActionLog[] = [];

    for (const rule of this.rules) {
      if (rule.condition(currentContext)) {
        const log = rule.execute(currentContext);
        this.actionHistory.unshift(log); // Keep newest at top
        actionsTaken.push(log);
      }
    }

    return actionsTaken.length > 0 ? actionsTaken : null;
  }
}

