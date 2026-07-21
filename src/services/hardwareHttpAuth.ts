import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseNodeKeys } from './hardwareProtocol.ts';

export type SignedHardwareRequest = { nodeId: string; sequence: number; timestamp: number; signature: string };

export class HardwareHttpAuthenticator {
  private readonly keys = parseNodeKeys(process.env.UJO_NODE_KEYS_JSON);
  private readonly highest = new Map<string, number>();

  configured(nodeId: string): boolean { return this.keys.has(nodeId); }

  verify(meta: SignedHardwareRequest, body: Buffer, nowSeconds = Math.floor(Date.now() / 1000)): { valid: boolean; reason?: string; bodyHash?: string } {
    if (!/^ujo-[a-z0-9-]{3,64}$/.test(meta.nodeId)) return { valid: false, reason: 'invalid-node-id' };
    if (!Number.isSafeInteger(meta.sequence) || meta.sequence < 0) return { valid: false, reason: 'invalid-sequence' };
    if (!Number.isSafeInteger(meta.timestamp) || Math.abs(nowSeconds - meta.timestamp) > 120) return { valid: false, reason: 'stale-request' };
    const secret = this.keys.get(meta.nodeId);
    if (!secret) return { valid: false, reason: 'unknown-node' };
    const previous = this.highest.get(meta.nodeId) ?? -1;
    if (meta.sequence <= previous) return { valid: false, reason: 'replayed-request' };
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const expected = Buffer.from(createHmac('sha256', secret).update(`${meta.nodeId}|${meta.sequence}|${meta.timestamp}|${bodyHash}`).digest('hex'), 'hex');
    const actual = Buffer.from(meta.signature || '', 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { valid: false, reason: 'bad-signature' };
    this.highest.set(meta.nodeId, meta.sequence);
    return { valid: true, bodyHash };
  }
}
