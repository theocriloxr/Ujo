import { createHmac, timingSafeEqual } from 'node:crypto';

export interface HardwareEnvelope<T = Record<string, unknown>> {
  v: 1;
  nodeId: string;
  seq: number;
  timestamp: number;
  type: 'telemetry' | 'status' | 'ack' | 'command';
  payload: T;
  signature: string;
}

export function signingInput(envelope: Omit<HardwareEnvelope, 'signature'>): string {
  return [
    envelope.nodeId,
    envelope.seq,
    envelope.timestamp,
    envelope.type,
    JSON.stringify(envelope.payload)
  ].join('|');
}

export function signEnvelope(envelope: Omit<HardwareEnvelope, 'signature'>, secret: string): string {
  return createHmac('sha256', secret).update(signingInput(envelope)).digest('hex');
}

export class HardwareReplayGuard {
  private readonly highestSequence = new Map<string, number>();

  verify(
    envelope: HardwareEnvelope,
    secret: string,
    nowSeconds = Math.floor(Date.now() / 1000),
    maxClockSkewSeconds = 120
  ): { valid: boolean; reason?: string } {
    if (!/^ujo-[a-z0-9-]{3,64}$/.test(envelope.nodeId)) return { valid: false, reason: 'invalid-node-id' };
    if (!Number.isSafeInteger(envelope.seq) || envelope.seq < 0) return { valid: false, reason: 'invalid-sequence' };
    if (Math.abs(nowSeconds - envelope.timestamp) > maxClockSkewSeconds) return { valid: false, reason: 'stale-message' };
    const expected = Buffer.from(signEnvelope({
      v: envelope.v,
      nodeId: envelope.nodeId,
      seq: envelope.seq,
      timestamp: envelope.timestamp,
      type: envelope.type,
      payload: envelope.payload
    }, secret), 'hex');
    const actual = Buffer.from(envelope.signature || '', 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { valid: false, reason: 'bad-signature' };
    const previous = this.highestSequence.get(envelope.nodeId) ?? -1;
    if (envelope.seq <= previous) return { valid: false, reason: 'replayed-message' };
    this.highestSequence.set(envelope.nodeId, envelope.seq);
    return { valid: true };
  }
}

export function parseNodeKeys(raw: string | undefined): Map<string, string> {
  if (!raw) return new Map();
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const entries = Object.entries(parsed).filter((entry): entry is [string, string] => (
    /^ujo-[a-z0-9-]{3,64}$/.test(entry[0]) && typeof entry[1] === 'string' && entry[1].length >= 32
  ));
  return new Map(entries);
}
