# Ujo Cloud Control Plane Scaffold

This folder is the contract and data foundation for the commercial multi-tenant layer. It is intentionally separate from the in-home SQLite schema.

Included:
- PostgreSQL Prisma schema with organizations, homes, hubs, certificates, entitlements, remote command lifecycle, signed OTA releases, deployments, and append-only audit events.
- Starter PostgreSQL RLS policies.
- OpenAPI contract for user and mutual-TLS hub endpoints.

Before implementation:
1. Select an identity provider with passkeys/MFA and organization claims.
2. Add a per-request transaction wrapper that sets `app.organization_id` before every query.
3. Test cross-tenant access for every table and endpoint.
4. Use KMS/HSM-backed signing for OTA, entitlements, and hub certificates.
5. Add a durable queue, idempotency store, rate limits, abuse controls, and observability redaction.
6. Deploy APIs separately from the Vercel static web client unless the selected Vercel runtime satisfies the durable-connection and queue architecture.
