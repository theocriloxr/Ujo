type ComponentStatus = { name: string; configured: boolean; healthy: boolean; detail?: string };

async function endpointHealth(name: string, endpoint: string | undefined, path = '/health'): Promise<ComponentStatus> {
  if (!endpoint) return { name, configured: false, healthy: false, detail: 'not configured' };
  try {
    const url = new URL(endpoint);
    url.pathname = path;
    url.search = '';
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return { name, configured: true, healthy: response.ok, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { name, configured: true, healthy: false, detail: error instanceof Error ? error.message : 'unreachable' };
  }
}

export class LocalAIRegistryService {
  constructor(private readonly ollamaBase = process.env.OLLAMA_URL || 'http://127.0.0.1:11434') {}

  async status() {
    const models: string[] = [];
    let ollamaHealthy = false;
    try {
      const response = await fetch(`${this.ollamaBase}/api/tags`, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) {
        const body = await response.json() as { models?: Array<{ name?: string; model?: string }> };
        models.push(...(body.models ?? []).map(item => item.name || item.model || '').filter(Boolean));
        ollamaHealthy = true;
      }
    } catch {
      ollamaHealthy = false;
    }
    const [stt, tts] = await Promise.all([
      endpointHealth('speech-to-text', process.env.LOCAL_STT_URL),
      endpointHealth('text-to-speech', process.env.LOCAL_TTS_URL)
    ]);
    const required = [process.env.OLLAMA_MODEL || 'ujo-assistant', process.env.UJO_EMBED_MODEL || 'embeddinggemma'];
    const vision = process.env.UJO_ENABLE_VISION === 'false' ? undefined : (process.env.UJO_VISION_MODEL || 'gemma3:4b');
    if (vision) required.push(vision);
    return {
      profile: process.env.UJO_HUB_PROFILE || 'mini',
      ollama: { configured: true, healthy: ollamaHealthy, baseUrl: this.ollamaBase, installedModels: models, requiredModels: required, missingModels: required.filter(model => !models.some(installed => installed === model || installed.startsWith(`${model}:`))) },
      speech: { stt, tts },
      ready: ollamaHealthy && required.every(model => models.some(installed => installed === model || installed.startsWith(`${model}:`))) && stt.healthy && tts.healthy
    };
  }
}
