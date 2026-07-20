import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalSpeechService } from '../src/services/LocalSpeechService.ts';

test('local speech forwards audio without cloud processing', async () => {
  let receivedType = '';
  const request = async (_url: string | URL | Request, init?: RequestInit) => {
    receivedType = String((init?.headers as Record<string, string>)['content-type']);
    return Response.json({ text: 'turn on the light', language: 'en' });
  };
  const result = await new LocalSpeechService('http://stt.test', request as typeof fetch).transcribe(Buffer.from([1, 2]), 'audio/webm');
  assert.equal(receivedType, 'audio/webm');
  assert.equal(result?.text, 'turn on the light');
  assert.equal(result?.source, 'local');
});

test('local speech rejects oversized audio before transport', async () => {
  await assert.rejects(() => new LocalSpeechService('http://stt.test').transcribe(Buffer.alloc(10 * 1024 * 1024 + 1), 'audio/wav'));
});
