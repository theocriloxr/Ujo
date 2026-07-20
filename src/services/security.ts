import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';

export function hashPin(pin: string, salt = randomBytes(16).toString('hex')): string {
  assertValidPin(pin);
  return hashCredential(pin, salt);
}

export function hashCredential(value: string, salt = randomBytes(16).toString('hex')): string {
  if (value.length < 1) throw new Error('Credential cannot be empty.');
  const digest = scryptSync(value, salt, KEY_LENGTH).toString('hex');
  return `${HASH_PREFIX}$${salt}$${digest}`;
}

export function verifyPin(pin: string, encodedHash: string): boolean {
  if (!/^\d{4,12}$/.test(pin)) return false;
  return verifyCredential(pin, encodedHash);
}

export function verifyCredential(value: string, encodedHash: string): boolean {
  const [algorithm, salt, expectedHex] = encodedHash.split('$');
  if (algorithm !== HASH_PREFIX || !salt || !expectedHex) return false;
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(value, salt, expected.length);
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function sessionTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function safeEqualText(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function assertValidPin(pin: string): void {
  if (!/^\d{4,12}$/.test(pin)) {
    throw new Error('PIN must contain between 4 and 12 digits.');
  }
}

export function assertProductionSecrets(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') return;
  const jwt = env.JWT_SECRET ?? '';
  if (jwt.length < 32 || jwt.includes('change') || jwt.includes('dev_secret')) {
    throw new Error('JWT_SECRET must be a unique value of at least 32 characters in production.');
  }
  for (const name of ['UJO_OWNER_PIN', 'UJO_DURESS_PIN', 'UJO_STAFF_PIN'] as const) {
    if (!env[name]) throw new Error(`${name} is required in production.`);
    assertValidPin(env[name]!);
  }
  if (env.UJO_OWNER_PIN === env.UJO_DURESS_PIN) {
    throw new Error('Owner and duress PINs must be different.');
  }
  if ((env.UJO_BRIDGE_TOKEN ?? '').length < 32) {
    throw new Error('UJO_BRIDGE_TOKEN must contain at least 32 characters in production.');
  }
  if (!(env.APP_ORIGINS ?? '').trim()) throw new Error('APP_ORIGINS is required in production.');
  if (!(env.UJO_ADMIN_EMAIL ?? '').includes('@')) throw new Error('UJO_ADMIN_EMAIL is required in production.');
  if ((env.UJO_ADMIN_PASSWORD ?? '').length < 12) throw new Error('UJO_ADMIN_PASSWORD must contain at least 12 characters in production.');
}

type Attempt = { count: number; resetAt: number };

export class AttemptLimiter {
  private readonly attempts = new Map<string, Attempt>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 5, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    }
    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
