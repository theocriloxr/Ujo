export type Transcript = { text: string; language?: string; durationSeconds?: number; source: 'local' };
type FetchLike = typeof fetch;

export class LocalSpeechService {
  private readonly endpoint: string | undefined;
  private readonly request: FetchLike;

  constructor(endpoint = process.env.LOCAL_STT_URL?.trim(), request: FetchLike = fetch) {
    this.endpoint = endpoint;
    this.request = request;
  }

  async transcribe(audio: Buffer, mimeType: string, language?: string): Promise<Transcript | null> {
    if (!this.endpoint) return null;
    if (!audio.length || audio.length > 10 * 1024 * 1024) throw new Error('Audio must be between 1 byte and 10 MiB.');
    const response = await this.request(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': mimeType,
        ...(language ? { 'x-ujo-language': language } : {})
      },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(Number(process.env.LOCAL_STT_TIMEOUT_MS || 60_000))
    });
    if (!response.ok) throw new Error(`Local STT returned HTTP ${response.status}`);
    const body = await response.json() as { text?: string; language?: string; durationSeconds?: number };
    if (typeof body.text !== 'string') throw new Error('Local STT returned an invalid transcript');
    return { text: body.text.trim(), language: body.language, durationSeconds: body.durationSeconds, source: 'local' };
  }
}
