import { createPublicKey } from 'node:crypto';
import jwt from 'jsonwebtoken';

export type ProductMember = { productAccountId: string; role: 'OWNER' | 'ADMIN' | 'ADULT' | 'CHILD' | 'GUEST' | 'SERVICE'; active: boolean };
export type IdentityTrust = {
  issuer: string; audience: string; homeId: string;
  publicKeys: Record<string, string>;
  members: Record<string, ProductMember>;
  revokedSessions: string[];
};
export type IdentityPrincipal = { accountId: string; productAccountId: string; homeId: string; sessionId: string; scopes: string[]; role: ProductMember['role'] };

const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const roles = new Set(['OWNER', 'ADMIN', 'ADULT', 'CHILD', 'GUEST', 'SERVICE']);

/** Trust is provisioned locally, never read from user-editable JWT metadata or token URLs. */
export function verifyCriloxAccess(token: string, trust: IdentityTrust, requiredScope: string, now = Math.floor(Date.now() / 1000)): IdentityPrincipal {
  const deny = (): never => { throw new Error('CRILOX access denied'); };
  try {
    if (typeof token !== 'string' || token.length > 16384 || !Number.isSafeInteger(now)) return deny();
    if (!trust || !id(trust.homeId) || !trust.issuer.startsWith('https://') || !trust.audience || !Array.isArray(trust.revokedSessions)) return deny();
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || decoded.header.typ !== 'at+jwt' || decoded.header.alg !== 'RS256' || !id(decoded.header.kid)) return deny();
    if (!Object.hasOwn(trust.publicKeys, decoded.header.kid)) return deny();
    const key = createPublicKey(trust.publicKeys[decoded.header.kid]);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return deny();
    const claims = jwt.verify(token, key, { algorithms: ['RS256'], issuer: trust.issuer, audience: trust.audience, clockTimestamp: now });
    if (typeof claims === 'string' || !id(claims.sub) || !id(claims.jti) || !id(claims.sid) || !id(claims.product_account_id)) return deny();
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.iat! > now || claims.exp! <= claims.iat! || claims.exp! - claims.iat! > 300) return deny();
    if (claims.product !== 'ujo' || claims.home_id !== trust.homeId || claims.aud !== trust.audience) return deny();
    if (trust.revokedSessions.includes(claims.sid) || !Object.hasOwn(trust.members, claims.sub)) return deny();
    const member = trust.members[claims.sub];
    if (member.active !== true || !roles.has(member.role) || member.productAccountId !== claims.product_account_id) return deny();
    if (typeof claims.scope !== 'string' || claims.scope.length > 2048) return deny();
    const scopes = claims.scope.split(' ').filter(Boolean);
    if (!scopes.includes(requiredScope)) return deny();
    return { accountId: claims.sub, productAccountId: member.productAccountId, homeId: trust.homeId,
      sessionId: claims.sid, scopes, role: member.role };
  } catch {
    return deny();
  }
}
