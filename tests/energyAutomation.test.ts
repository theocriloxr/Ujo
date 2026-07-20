import test from 'node:test';
import assert from 'node:assert/strict';
import { planEnergySafety } from '../src/services/EnergyOrchestrator.ts';
import { validateAutomationDefinition } from '../src/services/AutomationPolicy.ts';
import { triggerMatches } from '../src/services/AutomationEngine.ts';

test('inverter overload sheds lowest-priority loads before critical loads', () => {
  const plan = planEnergySafety({ source: 'INVERTER', voltage: 220, batteryPct: 80, totalWatts: 4200, minimumMainsVoltage: 180, maximumMainsVoltage: 260, inverterReservePct: 25, inverterMaxWatts: 3000, generatorMaxWatts: 5000 }, [
    { id: 'fridge', name: 'Fridge', priority: 1, ratedWatts: 200, sheddable: false, isOn: true },
    { id: 'heater', name: 'Heater', priority: 5, ratedWatts: 1800, sheddable: true, isOn: true },
    { id: 'ac', name: 'AC', priority: 4, ratedWatts: 1500, sheddable: true, isOn: true }
  ]);
  assert.deepEqual(plan.shed.map(item => item.loadId), ['heater']);
  assert.equal(plan.remainingEstimatedWatts, 2400);
});

test('automation triggers match only explicit event fields', () => {
  assert.equal(triggerMatches('GEOFENCE', { placeId: 'market', event: 'ENTER' }, 'GEOFENCE', { placeId: 'market', event: 'ENTER' }), true);
  assert.equal(triggerMatches('GEOFENCE', { placeId: 'market', event: 'ENTER' }, 'GEOFENCE', { placeId: 'home', event: 'ENTER' }), false);
  assert.equal(triggerMatches('SENSOR_THRESHOLD', { field: 'temperatureC', operator: 'GT', threshold: 30 }, 'SENSOR_THRESHOLD', { temperatureC: 31 }), true);
});

test('unsafe mains requests isolation and sheds controllable loads', () => {
  const plan = planEnergySafety({ source: 'MAINS', voltage: 275, totalWatts: 500, minimumMainsVoltage: 180, maximumMainsVoltage: 260, inverterReservePct: 25, inverterMaxWatts: 3000, generatorMaxWatts: 5000 }, [
    { id: 'compressor', name: 'Compressor', priority: 2, ratedWatts: 500, sheddable: true, isOn: true }
  ]);
  assert.equal(plan.isolateMains, true);
  assert.equal(plan.shed[0].loadId, 'compressor');
});

test('automation validator rejects direct access-control actions', () => {
  assert.deepEqual(validateAutomationDefinition({ name: 'Evening lights', triggerType: 'SCHEDULE', mode: 'SINGLE', actions: [{ type: 'REQUEST_DEVICE_STATE', target: 'light_1', value: 'on' }] }), []);
  assert.ok(validateAutomationDefinition({ name: 'Unlock gate', triggerType: 'GEOFENCE', actions: [{ type: 'REQUEST_DEVICE_STATE', target: 'front-door-lock', value: 'open' }] }).some(error => error.includes('access')));
});
