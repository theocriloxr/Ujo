import test from 'node:test';
import assert from 'node:assert/strict';
import { batteryPresentation } from '../src/lib/telemetryPresentation.ts';

test('missing or invalid battery telemetry never appears critical or measured', () => {
  for (const value of [null, undefined, NaN, Infinity, -1, 101, '10', false]) {
    assert.deepEqual(batteryPresentation(value), { label: 'No telemetry', percent: null, low: false });
  }
  assert.deepEqual(batteryPresentation(0), { label: '0%', percent: 0, low: true });
  assert.deepEqual(batteryPresentation(20), { label: '20%', percent: 20, low: false });
  assert.deepEqual(batteryPresentation(100), { label: '100%', percent: 100, low: false });
});
