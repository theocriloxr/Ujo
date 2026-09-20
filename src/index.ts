export type BridgeRequest =
  | { action: 'status' | 'get_state' | 'list_nodes'; parameters?: Record<string, never> }
  | { action: 'device_control'; parameters: { id: string; state: 'on' | 'off' } };

export type BridgeReply = {
  httpStatus: 200 | 202;
  physicalVerified: false;
  response: Readonly<Record<string, unknown>>;
};

export type BridgeErrorCode = 'INVALID_CONFIG' | 'INVALID_REQUEST' | 'HTTP_ERROR'
  | 'INVALID_RESPONSE' | 'RESPONSE_TOO_LARGE' | 'TIMEOUT' | 'ABORTED' | 'TRANSPORT_ERROR';

/** Deliberately excludes URLs, bearer tokens, response bodies and native causes. */
export class BridgeError extends Error {
  constructor(public readonly code: BridgeErrorCode, public readonly httpStatus?: number) {
    super(`UJO bridge ${code.toLowerCase().replaceAll('_', ' ')}`);
    this.name = 'BridgeError';
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Own-field validation matches the version 1 JSON schema. */
export function parseRequest(value: unknown): BridgeRequest {
  if (!object(value) || !Object.hasOwn(value, 'action')
    || Object.keys(value).some(key => key !== 'action' && key !== 'parameters')) {
    throw new BridgeError('INVALID_REQUEST');
  }
  const parameters: unknown = value.parameters === undefined ? {} : value.parameters;
  if (!object(parameters)) throw new BridgeError('INVALID_REQUEST');
  if (value.action === 'status' || value.action === 'get_state' || value.action === 'list_nodes') {
    if (Object.keys(parameters).length) throw new BridgeError('INVALID_REQUEST');
    return { action: value.action, parameters: {} };
  }
  if (value.action !== 'device_control' || Object.keys(parameters).some(key => key !== 'id' && key !== 'state')
    || !Object.hasOwn(parameters, 'id') || !Object.hasOwn(parameters, 'state')
    || typeof parameters.id !== 'string' || parameters.id.length < 1 || parameters.id.length > 128
    || (parameters.state !== 'on' && parameters.state !== 'off')) throw new BridgeError('INVALID_REQUEST');
  return { action: 'device_control', parameters: { id: parameters.id, state: parameters.state } };
}

export class UjoBridgeClient {
  readonly #endpoint: string;
  readonly #token: string;
  readonly #timeoutMs: number;

  constructor(options: { baseUrl: string; token: string; timeoutMs?: number }) {
    let url: URL;
    try { url = new URL(options.baseUrl); } catch { throw new BridgeError('INVALID_CONFIG'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new BridgeError('INVALID_CONFIG');
    }
    if (typeof options.token !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(options.token)) {
      throw new BridgeError('INVALID_CONFIG');
    }
    const timeout = options.timeoutMs ?? 15000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 15000) throw new BridgeError('INVALID_CONFIG');
    this.#endpoint = new URL('/api/v1/execute', url).href;
    this.#token = options.token;
    this.#timeoutMs = timeout;
  }

  async execute(input: BridgeRequest, options: { signal?: AbortSignal } = {}): Promise<BridgeReply> {
    const request = parseRequest(input);
    if (options.signal?.aborted) throw new BridgeError('ABORTED');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.#timeoutMs);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(this.#endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.#token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
      });
      if (response.status !== 200 && response.status !== 202) {
        await response.body?.cancel();
        throw new BridgeError('HTTP_ERROR', response.status);
      }
      if (response.headers.get('x-ujo-protocol-version') !== '1.0'
        || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
        || !response.body) {
        await response.body?.cancel();
        throw new BridgeError('INVALID_RESPONSE');
      }
      if (Number(response.headers.get('content-length')) > 256000) {
        await response.body.cancel();
        throw new BridgeError('RESPONSE_TOO_LARGE');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 256000) {
            await reader.cancel();
            throw new BridgeError('RESPONSE_TOO_LARGE');
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let result: unknown;
      try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new BridgeError('INVALID_RESPONSE'); }
      if (!object(result) || result.status !== 'success') throw new BridgeError('INVALID_RESPONSE');
      if (request.action === 'device_control') {
        const control = result.result;
        if (!object(control) || typeof control.accepted !== 'boolean'
          || control.deviceId !== request.parameters.id || control.desiredState !== request.parameters.state
          || !['COMPLETED', 'SENT', 'PENDING_APPROVAL'].includes(String(control.status))
          || (response.status === 200) !== (control.status === 'COMPLETED')) throw new BridgeError('INVALID_RESPONSE');
      } else {
        if (response.status !== 200) throw new BridgeError('INVALID_RESPONSE');
        if (request.action === 'list_nodes') {
          if (!Array.isArray(result.nodes) || result.nodes.some(node => typeof node !== 'string')) {
            throw new BridgeError('INVALID_RESPONSE');
          }
        } else if (!Object.hasOwn(result, 'state')) throw new BridgeError('INVALID_RESPONSE');
      }
      return { httpStatus: response.status, physicalVerified: false, response: result };
    } catch (error) {
      if (timedOut) throw new BridgeError('TIMEOUT');
      if (options.signal?.aborted) throw new BridgeError('ABORTED');
      if (error instanceof BridgeError) throw error;
      throw new BridgeError('TRANSPORT_ERROR');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
