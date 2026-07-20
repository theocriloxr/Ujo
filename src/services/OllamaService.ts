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
    model = process.env.OLLAMA_MODEL || modelForProfile(process.env.UJO_HUB_PROFILE)
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
