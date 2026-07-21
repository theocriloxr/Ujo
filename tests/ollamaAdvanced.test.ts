import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaService } from '../src/services/OllamaService.ts';

test('local embeddings use the configured Ollama embedding model', async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.UJO_EMBED_MODEL;
  process.env.UJO_EMBED_MODEL = 'embeddinggemma';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.model, 'embeddinggemma');
    assert.deepEqual(body.input, ['kitchen energy', 'water tank']);
    return new Response(JSON.stringify({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await new OllamaService('http://ollama:11434').embed(['kitchen energy', 'water tank']);
    assert.equal(result.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) delete process.env.UJO_EMBED_MODEL; else process.env.UJO_EMBED_MODEL = originalModel;
  }
});

test('local vision returns structured observations without authorizing actions', async () => {
  const originalFetch = globalThis.fetch;
  const originalVision = process.env.UJO_ENABLE_VISION;
  process.env.UJO_ENABLE_VISION = 'true';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.ok(body.messages[0].content.includes('Do not identify a person'));
    assert.equal(body.images, undefined);
    assert.deepEqual(body.messages[0].images, ['ZmFrZQ==']);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ summary: 'A refrigerator shelf is visible.', observations: ['One bottle is visible.'], confidence: 0.7, safetyNotice: 'Visual evidence only.' }) } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await new OllamaService('http://ollama:11434').analyzeImage('ZmFrZQ==', 'Describe the shelf.');
    assert.equal(result.confidence, 0.7);
    assert.deepEqual(result.observations, ['One bottle is visible.']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalVision === undefined) delete process.env.UJO_ENABLE_VISION; else process.env.UJO_ENABLE_VISION = originalVision;
  }
});
