import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalVoiceService } from '../src/services/LocalVoiceService.ts';

test('local voice accepts raw WAV audio', async () => {
  const request = async () => new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'content-type': 'audio/wav' } });
  const result = await new LocalVoiceService('http://voice.test', request as typeof fetch).synthesize('hello');
  assert.equal(result?.audio, 'UklGRg==');
  assert.equal(result?.encoding, 'wav');
  assert.equal(result?.source, 'local');
});

test('local voice is inert when no endpoint is configured', async () => {
  assert.equal(await new LocalVoiceService('').synthesize('hello'), null);
});
