export interface MaintenanceInput {
  runtimeHours: number;
  expectedLifeHours?: number | null;
  serviceIntervalHours?: number | null;
  serviceIntervalDays?: number | null;
  installedAt: Date;
  lastServicedAt?: Date | null;
  measuredHealthScore?: number;
  now?: Date;
}

export function assessMaintenance(input: MaintenanceInput) {
  const now = input.now ?? new Date();
  const serviceStart = input.lastServicedAt ?? input.installedAt;
  const daysSinceService = (now.getTime() - serviceStart.getTime()) / 86_400_000;
  const hoursDue = input.serviceIntervalHours ? input.runtimeHours >= input.serviceIntervalHours : false;
  const daysDue = input.serviceIntervalDays ? daysSinceService >= input.serviceIntervalDays : false;
  const lifeUsedPct = input.expectedLifeHours ? Math.min(100, (input.runtimeHours / input.expectedLifeHours) * 100) : null;
  const healthScore = Math.max(0, Math.min(100, input.measuredHealthScore ?? (lifeUsedPct === null ? 100 : 100 - lifeUsedPct * 0.5)));
  const status = healthScore < 30 ? 'CRITICAL' : hoursDue || daysDue || healthScore < 60 ? 'SERVICE_DUE' : 'HEALTHY';
  return { status, healthScore: Math.round(healthScore), lifeUsedPct: lifeUsedPct === null ? null : Math.round(lifeUsedPct), daysSinceService: Math.floor(daysSinceService) };
}

export interface WaterInput {
  levelPct: number;
  lowLevelPct: number;
  highLevelPct: number;
  pumpRunning: boolean;
  flowLitresMinute?: number | null;
  leakDetected?: boolean;
}

export function assessWater(input: WaterInput) {
  const alerts: Array<{ severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'; code: string; message: string }> = [];
  let protectiveAction: 'STOP_PUMP' | null = null;
  if (input.leakDetected) alerts.push({ severity: 'CRITICAL', code: 'LEAK', message: 'Water leak sensor is active.' });
  if (input.pumpRunning && (input.flowLitresMinute ?? 0) <= 0.05) {
    alerts.push({ severity: 'CRITICAL', code: 'DRY_RUN', message: 'Pump is running without measurable flow.' });
    protectiveAction = 'STOP_PUMP';
  }
  if (input.pumpRunning && input.levelPct >= input.highLevelPct) {
    alerts.push({ severity: 'HIGH', code: 'OVERFILL_RISK', message: 'Tank reached its high-level threshold while the pump is running.' });
    protectiveAction = 'STOP_PUMP';
  }
  if (input.levelPct <= input.lowLevelPct) alerts.push({ severity: 'MEDIUM', code: 'LOW_LEVEL', message: 'Tank water is below the configured reserve.' });
  return { alerts, protectiveAction, status: alerts.some(alert => alert.severity === 'CRITICAL') ? 'CRITICAL' : alerts.length ? 'ATTENTION' : 'NORMAL' };
}
