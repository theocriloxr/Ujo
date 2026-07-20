export type SpeechAudio = {
  audio: string;
  encoding: string;
  sampleRate: number;
  source: 'local' | 'cloud';
};

type FetchLike = typeof fetch;

/**
 * HTTP boundary for an on-premises TTS service. The default contract is deliberately
 * tiny so Piper, Kokoro or a Wyoming adapter can sit behind it without coupling Ujo
 * to one voice engine: POST { text, voice } and return audio bytes or JSON { audio }.
 */
export class LocalVoiceService {
  private readonly endpoint: string | undefined;
  private readonly request: FetchLike;

  constructor(
    endpoint = process.env.LOCAL_TTS_URL?.trim(),
    request: FetchLike = fetch
  ) {
    this.endpoint = endpoint;
    this.request = request;
  }

  public configured(): boolean {
    return Boolean(this.endpoint);
  }

  public async synthesize(text: string, voice = process.env.LOCAL_TTS_VOICE || 'en_GB-alan-medium'): Promise<SpeechAudio | null> {
    if (!this.endpoint) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.LOCAL_TTS_TIMEOUT_MS || 15_000));
    try {
      const response = await this.request(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/wav, application/json' },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Local TTS returned HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const result = await response.json() as { audio?: string; encoding?: string; sampleRate?: number };
        if (!result.audio) throw new Error('Local TTS response did not contain audio');
        return { audio: result.audio, encoding: result.encoding || 'wav', sampleRate: result.sampleRate || 22_050, source: 'local' };
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error('Local TTS returned empty audio');
      return { audio: bytes.toString('base64'), encoding: contentType.includes('wav') ? 'wav' : 'pcm_s16le', sampleRate: 22_050, source: 'local' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
