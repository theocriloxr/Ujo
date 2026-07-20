import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMaintenance, assessWater } from '../src/services/InfrastructureIntelligence.ts';

test('maintenance becomes due from either calendar or runtime interval', () => {
  const result = assessMaintenance({ runtimeHours: 90, serviceIntervalHours: 100, serviceIntervalDays: 30, installedAt: new Date('2026-01-01'), now: new Date('2026-02-05') });
  assert.equal(result.status, 'SERVICE_DUE');
  assert.equal(result.daysSinceService, 35);
});

test('dry-running and overfilling pumps fail toward a protective stop', () => {
  assert.equal(assessWater({ levelPct: 20, lowLevelPct: 15, highLevelPct: 95, pumpRunning: true, flowLitresMinute: 0 }).protectiveAction, 'STOP_PUMP');
  assert.equal(assessWater({ levelPct: 96, lowLevelPct: 15, highLevelPct: 95, pumpRunning: true, flowLitresMinute: 5 }).protectiveAction, 'STOP_PUMP');
});

test('low water notifies but does not start a pump without configured policy', () => {
  const result = assessWater({ levelPct: 10, lowLevelPct: 15, highLevelPct: 95, pumpRunning: false });
  assert.equal(result.protectiveAction, null);
  assert.ok(result.alerts.some(alert => alert.code === 'LOW_LEVEL'));
});
