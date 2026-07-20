import test from 'node:test';
import assert from 'node:assert/strict';
import { modelForProfile } from '../src/services/OllamaService.ts';
import { evaluateProposedAction, isSensitiveNaturalLanguage } from '../src/services/commandPolicy.ts';

test('offline model selection matches hub capacity', () => {
  assert.equal(modelForProfile('pi'), 'qwen3:1.7b');
  assert.equal(modelForProfile('mini'), 'qwen3:4b');
  assert.equal(modelForProfile('workstation'), 'qwen3:8b');
  assert.equal(modelForProfile(undefined), 'qwen3:4b');
});

test('natural-language input is never an access or payment credential', () => {
  assert.equal(isSensitiveNaturalLanguage('please unlock the front door'), true);
  assert.equal(isSensitiveNaturalLanguage('open front gate then turn on the lights'), true);
  assert.equal(isSensitiveNaturalLanguage('buy diesel for the generator'), true);
  assert.equal(isSensitiveNaturalLanguage('turn on the kitchen lights'), false);
});

test('assistant may read state but cannot directly unlock the home', () => {
  assert.equal(evaluateProposedAction({ action: 'query_state', reason: 'status' }).decision, 'ALLOW');
  assert.equal(evaluateProposedAction({ action: 'device_control', target: 'front-door-lock', value: 'open', reason: 'asked' }).decision, 'DENY');
  assert.equal(evaluateProposedAction({ action: 'device_control', target: 'light_1', value: 'on', reason: 'asked' }).decision, 'REQUIRE_APPROVAL');
});
