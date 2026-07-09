'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserGlobal } = require('../helpers/loadBrowserGlobal');

const MODELS_DATA = loadBrowserGlobal('app/models-data.js', 'MODELS_DATA');

test('getModel returns the matching model by id', () => {
  const model = MODELS_DATA.getModel('claude-opus-4-5');
  assert.ok(model, 'expected claude-opus-4-5 to exist in the registry');
  assert.equal(model.provider, 'anthropic');
});

test('getModel returns null for an unknown id', () => {
  assert.equal(MODELS_DATA.getModel('not-a-real-model'), null);
});

test('every model references a provider that exists in providers{}', () => {
  // [...missing] re-materializes the array in this realm — MODELS_DATA.models
  // is an Array from the vm sandbox's realm, and assert.deepEqual against a
  // main-realm `[]` literal spuriously fails cross-realm even when empty.
  const missing = [...MODELS_DATA.models
    .map(m => m.provider)
    .filter(p => !MODELS_DATA.providers[p])];
  assert.deepEqual(missing, [], `models reference undefined providers: ${missing.join(', ')}`);
});

test('mistral is a registered provider with at least one model (regression: was configurable in Admin but unreachable)', () => {
  assert.ok(MODELS_DATA.providers.mistral, 'mistral provider entry missing');
  const mistralModels = MODELS_DATA.getModelsByProvider('mistral');
  assert.ok(mistralModels.length > 0, 'no models registered for provider "mistral"');
});

test('calculateCost computes input+output cost correctly for a known model', () => {
  const model = MODELS_DATA.models.find(m => m.provider === 'groq' && m.id === 'llama-3.1-8b-instant');
  assert.ok(model);
  const result = MODELS_DATA.calculateCost(model.id, 1_000_000, 1_000_000, 0);
  assert.equal(result.inputCost, model.inputPer1M);
  assert.equal(result.outputCost, model.outputPer1M);
  assert.ok(Math.abs(result.totalCost - (model.inputPer1M + model.outputPer1M)) < 1e-9);
});

test('calculateCost returns zeroed result for an unknown model instead of throwing', () => {
  const result = MODELS_DATA.calculateCost('nonexistent-model', 100, 100);
  assert.equal(result.totalCost, 0);
  assert.equal(result.totalFormatted, '—');
});

test('image-gen models have zero token cost (billed per-image upstream, not per-token)', () => {
  const imageModels = MODELS_DATA.models.filter(m => m.provider === 'image-gen');
  assert.ok(imageModels.length >= 4, 'expected the BFL/fal/Replicate/ComfyUI image models to be registered');
  for (const m of imageModels) {
    assert.equal(m.inputPer1M, 0);
    assert.equal(m.outputPer1M, 0);
  }
});

test('every model tier has a matching entry in tierLabel', () => {
  const missing = [...MODELS_DATA.models
    .map(m => m.tier)
    .filter(t => !MODELS_DATA.tierLabel[t])];
  assert.deepEqual(missing, [], `models reference undefined tiers: ${missing.join(', ')}`);
});
