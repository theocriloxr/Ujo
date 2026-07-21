export type HubProfile = 'pi' | 'mini' | 'workstation';

export interface ProposedAction {
  action: 'device_control' | 'set_mode' | 'power_state' | 'query_state' | 'create_automation';
  target?: string;
  value?: string;
  reason: string;
}

export interface AssistantPlan {
  reply: string;
  actions: ProposedAction[];
}

const PROFILE_MODELS: Record<HubProfile, string> = {
  pi: 'qwen3:1.7b',
  mini: 'qwen3:4b',
  workstation: 'qwen3:8b'
};

export function modelForProfile(profile: string | undefined): string {
  if (profile === 'pi' || profile === 'workstation' || profile === 'mini') return PROFILE_MODELS[profile];
  return PROFILE_MODELS.mini;
}

export class OllamaService {
  readonly model: string;
  private readonly baseUrl: string;

  constructor(
    baseUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    model = process.env.OLLAMA_MODEL || 'ujo-assistant'
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async health(): Promise<{ available: boolean; model: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok) return { available: false, model: this.model };
      const body = await response.json() as { models?: Array<{ name: string }> };
      return { available: body.models?.some(item => item.name === this.model) ?? false, model: this.model };
    } catch {
      return { available: false, model: this.model };
    }
  }

  async embed(input: string | string[]): Promise<number[][]> {
    const values = Array.isArray(input) ? input : [input];
    if (!values.length || values.length > 64 || values.some(value => !value.trim() || value.length > 8_000)) {
      throw new Error('Embedding input must contain 1 to 64 non-empty strings of at most 8000 characters.');
    }
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ model: process.env.UJO_EMBED_MODEL || 'embeddinggemma', input: values })
    });
    if (!response.ok) throw new Error(`Ollama embedding request failed with status ${response.status}.`);
    const body = await response.json() as { embeddings?: number[][] };
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== values.length) throw new Error('Ollama returned invalid embeddings.');
    return body.embeddings;
  }

  async analyzeImage(imageBase64: string, prompt: string): Promise<{ summary: string; observations: string[]; confidence: number; safetyNotice: string }> {
    if (process.env.UJO_ENABLE_VISION === 'false') throw new Error('Local vision is disabled.');
    if (!imageBase64 || imageBase64.length > 3_000_000) throw new Error('Vision image is missing or too large.');
    if (!prompt.trim() || prompt.length > 1_000) throw new Error('Vision prompt must be between 1 and 1000 characters.');
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: process.env.UJO_VISION_MODEL || 'gemma3:4b',
        stream: false,
        format: {
          type: 'object',
          required: ['summary', 'observations', 'confidence', 'safetyNotice'],
          properties: {
            summary: { type: 'string' },
            observations: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            safetyNotice: { type: 'string' }
          }
        },
        options: { temperature: 0.1 },
        messages: [{
          role: 'user',
          content: `${prompt}
Describe visible evidence only. Do not identify a person, infer protected traits, declare food safe, or authorize a physical action.`,
          images: [imageBase64]
        }]
      })
    });
    if (!response.ok) throw new Error(`Ollama vision request failed with status ${response.status}.`);
    const body = await response.json() as { message?: { content?: string } };
    const parsed = JSON.parse(body.message?.content || '{}') as { summary?: unknown; observations?: unknown; confidence?: unknown; safetyNotice?: unknown };
    if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.observations) || typeof parsed.confidence !== 'number' || typeof parsed.safetyNotice !== 'string') {
      throw new Error('Ollama returned an invalid vision result.');
    }
    return {
      summary: parsed.summary.slice(0, 2_000),
      observations: parsed.observations.filter((item): item is string => typeof item === 'string').slice(0, 50),
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      safetyNotice: parsed.safetyNotice.slice(0, 1_000)
    };
  }

  async plan(text: string, stateSummary: unknown): Promise<AssistantPlan> {
    if (!text.trim() || text.length > 2_000) throw new Error('Assistant input must be between 1 and 2000 characters.');
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: {
          type: 'object',
          required: ['reply', 'actions'],
          properties: {
            reply: { type: 'string' },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['action', 'reason'],
                properties: {
                  action: { enum: ['device_control', 'set_mode', 'power_state', 'query_state', 'create_automation'] },
                  target: { type: 'string' },
                  value: { type: 'string' },
                  reason: { type: 'string' }
                }
              }
            }
          }
        },
        options: { temperature: 0.1 },
        messages: [
          {
            role: 'system',
            content: 'You are Ujo, a privacy-first home assistant. Propose actions only. Never claim an action ran. Safety policy and user approval are enforced by a separate deterministic engine.'
          },
          { role: 'user', content: JSON.stringify({ request: text, home: stateSummary }) }
        ]
      })
    });
    if (!response.ok) throw new Error(`Ollama request failed with status ${response.status}.`);
    const body = await response.json() as { message?: { content?: string } };
    const parsed = JSON.parse(body.message?.content || '{}') as AssistantPlan;
    if (typeof parsed.reply !== 'string' || !Array.isArray(parsed.actions)) throw new Error('Ollama returned an invalid plan.');
    return parsed;
  }
}
