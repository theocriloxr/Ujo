export interface ManagedLoad {
  id: string;
  name: string;
  priority: number;
  ratedWatts: number;
  sheddable: boolean;
  compressorLoad?: boolean;
  isOn: boolean;
}

export interface EnergyContext {
  source: 'MAINS' | 'INVERTER' | 'GENERATOR' | 'SOLAR';
  voltage: number;
  batteryPct?: number | null;
  totalWatts: number;
  minimumMainsVoltage: number;
  maximumMainsVoltage: number;
  inverterReservePct: number;
  inverterMaxWatts: number;
  generatorMaxWatts: number;
}

export interface EnergyPlan {
  isolateMains: boolean;
  shed: Array<{ loadId: string; reason: string }>;
  remainingEstimatedWatts: number;
  alerts: string[];
}

export function planEnergySafety(context: EnergyContext, loads: ManagedLoad[]): EnergyPlan {
  const alerts: string[] = [];
  const mainsUnsafe = context.source === 'MAINS' && (context.voltage < context.minimumMainsVoltage || context.voltage > context.maximumMainsVoltage);
  if (mainsUnsafe) alerts.push(`Mains voltage ${context.voltage}V is outside the configured safe range.`);
  const capacity = context.source === 'INVERTER' ? context.inverterMaxWatts : context.source === 'GENERATOR' ? context.generatorMaxWatts : Number.POSITIVE_INFINITY;
  const reserveTriggered = context.source === 'INVERTER' && context.batteryPct !== null && context.batteryPct !== undefined && context.batteryPct <= context.inverterReservePct;
  if (reserveTriggered) alerts.push(`Battery reserve threshold reached at ${context.batteryPct}%.`);
  let remaining = context.totalWatts;
  const candidates = loads
    .filter(load => load.isOn && load.sheddable)
    .sort((left, right) => right.priority - left.priority || right.ratedWatts - left.ratedWatts);
  const shed: EnergyPlan['shed'] = [];
  for (const load of candidates) {
    if (!reserveTriggered && remaining <= capacity && !mainsUnsafe) break;
    shed.push({ loadId: load.id, reason: mainsUnsafe ? 'Unsafe mains voltage' : reserveTriggered ? 'Battery reserve protection' : 'Source capacity exceeded' });
    remaining = Math.max(0, remaining - load.ratedWatts);
  }
  if (remaining > capacity) alerts.push(`Essential/non-sheddable demand still exceeds source capacity by ${Math.round(remaining - capacity)}W.`);
  return { isolateMains: mainsUnsafe, shed, remainingEstimatedWatts: remaining, alerts };
}
