export interface FreshnessInput {
  acquiredAt: Date;
  openedAt?: Date | null;
  labelExpiresAt?: Date | null;
  expectedShelfLifeDays?: number | null;
  afterOpeningDays?: number | null;
  temperatureExcursionHours?: number;
  ethyleneIncreasePct?: number;
  vocAnomaly?: boolean;
  visualQuality?: number | null;
  odorConcern?: boolean;
  now?: Date;
}

export interface FreshnessEstimate {
  score: number;
  status: 'FRESH' | 'USE_SOON' | 'CHECK' | 'PAST_ESTIMATE';
  estimatedUseBy: Date | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  disclaimer: string;
}

const DAY_MS = 86_400_000;

export function estimateFreshness(input: FreshnessInput): FreshnessEstimate {
  const now = input.now ?? new Date();
  const baselineStart = input.openedAt ?? input.acquiredAt;
  const shelfDays = input.openedAt && input.afterOpeningDays ? input.afterOpeningDays : input.expectedShelfLifeDays;
  const inferredUseBy = shelfDays ? new Date(baselineStart.getTime() + shelfDays * DAY_MS) : null;
  const estimatedUseBy = input.labelExpiresAt && inferredUseBy
    ? new Date(Math.min(input.labelExpiresAt.getTime(), inferredUseBy.getTime()))
    : input.labelExpiresAt ?? inferredUseBy;
  const reasons: string[] = [];
  let score = 100;

  if (estimatedUseBy && shelfDays) {
    const remainingDays = (estimatedUseBy.getTime() - now.getTime()) / DAY_MS;
    score = Math.min(score, Math.max(0, Math.round((remainingDays / shelfDays) * 100)));
    if (remainingDays < 0) reasons.push('The conservative storage or label estimate has passed.');
    else if (remainingDays <= 2) reasons.push('The conservative use-by estimate is within two days.');
  } else if (estimatedUseBy && estimatedUseBy <= now) {
    score = 0;
    reasons.push('The label date has passed.');
  } else if (!estimatedUseBy) {
    score = 60;
    reasons.push('No shelf-life baseline or label date is available.');
  }

  if ((input.temperatureExcursionHours ?? 0) > 0) {
    score -= Math.min(35, (input.temperatureExcursionHours ?? 0) * 3);
    reasons.push('Storage temperature moved outside the configured range.');
  }
  if ((input.ethyleneIncreasePct ?? 0) >= 50) {
    score -= Math.min(20, (input.ethyleneIncreasePct ?? 0) / 5);
    reasons.push('The produce-zone ethylene/VOC trend increased; this is a ripening indicator, not proof of spoilage.');
  }
  if (input.vocAnomaly) {
    score -= 15;
    reasons.push('The zone VOC pattern is unusual and needs human inspection.');
  }
  if (input.visualQuality !== null && input.visualQuality !== undefined) {
    score = Math.min(score, Math.max(0, input.visualQuality));
    if (input.visualQuality < 50) reasons.push('The latest visual observation indicates deterioration.');
  }
  if (input.odorConcern) {
    score = Math.min(score, 20);
    reasons.push('A household member reported an odor concern.');
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const estimatePassed = Boolean(estimatedUseBy && estimatedUseBy <= now);
  const inspectionSignal = Boolean(input.odorConcern || input.vocAnomaly || (input.visualQuality !== null && input.visualQuality !== undefined && input.visualQuality < 40) || (input.temperatureExcursionHours ?? 0) >= 4);
  const status = estimatePassed ? 'PAST_ESTIMATE' : inspectionSignal ? 'CHECK' : score < 70 ? 'USE_SOON' : 'FRESH';
  const evidenceCount = [estimatedUseBy, input.visualQuality, input.ethyleneIncreasePct, input.temperatureExcursionHours].filter(value => value !== null && value !== undefined).length;

  return {
    score,
    status,
    estimatedUseBy,
    confidence: evidenceCount >= 3 ? 'HIGH' : evidenceCount >= 2 ? 'MEDIUM' : 'LOW',
    reasons,
    disclaimer: 'This is a freshness and waste-reduction estimate, not a food-safety determination. Inspect the item and follow official food-safety guidance.'
  };
}
