import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFreshness } from '../src/services/FoodIntelligence.ts';

test('food estimate uses the more conservative label or storage date', () => {
  const result = estimateFreshness({
    acquiredAt: new Date('2026-01-01T00:00:00Z'), expectedShelfLifeDays: 10,
    labelExpiresAt: new Date('2026-01-20T00:00:00Z'), now: new Date('2026-01-09T00:00:00Z')
  });
  assert.equal(result.estimatedUseBy?.toISOString(), '2026-01-11T00:00:00.000Z');
  assert.equal(result.status, 'USE_SOON');
  assert.match(result.disclaimer, /not a food-safety determination/);
});

test('sensor anomalies request inspection without claiming food is unsafe', () => {
  const result = estimateFreshness({
    acquiredAt: new Date('2026-01-01T00:00:00Z'), expectedShelfLifeDays: 30,
    now: new Date('2026-01-03T00:00:00Z'), ethyleneIncreasePct: 80,
    temperatureExcursionHours: 5, vocAnomaly: true, visualQuality: 35
  });
  assert.equal(result.status, 'CHECK');
  assert.ok(result.reasons.some(reason => reason.includes('human inspection')));
  assert.equal(result.reasons.some(reason => reason.includes('unsafe')), false);
});
