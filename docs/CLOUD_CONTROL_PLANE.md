# Ujo Cloud Control Plane Specification

## Purpose

The cloud extends a home; it never becomes the home’s brain. Local control and safety continue when the internet, subscription service, or Ujo cloud is unavailable.

## Tenant hierarchy

- Organization / customer account
- Home / property
- Household members and roles
- Hub identity and certificate
- Rooms, devices, integrations, and policies
- Installer/technician relationships with time-limited delegated access

Every cloud row must be scoped by `organization_id` and, where relevant, `home_id`. Enforce row-level security in Postgres and verify it with cross-tenant negative tests.

## Required services

1. Identity, MFA/passkeys, household invitations, recovery, and session/device management.
2. Hub enrollment using one-time claim codes and mutual TLS certificates.
3. Outbound-only hub tunnel/signaling; never require router port forwarding.
4. Durable, expiring command envelopes with idempotency keys and approval evidence.
5. Fleet heartbeat, version, storage, temperature, radio, integration, and telemetry-health status.
6. Signed subscription entitlements cached locally with a grace period.
7. Signed OTA manifests, staged release rings, health checks, rollback, and revocation.
8. Push/email/SMS/WhatsApp adapters; all vendor orders remain approval-gated.
9. Append-only audit events and customer-visible privacy/export/delete workflows.
10. Optional encrypted backup, with per-home keys and retention policies.

## Command lifecycle

`REQUESTED → POLICY_CHECKED → APPROVAL_REQUIRED/APPROVED → DELIVERED → ACKNOWLEDGED → REPORTED_STATE_CONFIRMED`

Terminal failures include `REJECTED`, `EXPIRED`, `DELIVERY_FAILED`, `ACK_FAILED`, `STATE_MISMATCH`, and `REVOKED`.

Cloud responses must never mark a physical action complete before the edge hub confirms it.

## Data minimization

Cloud by default receives:
- hub health and software version;
- coarse device availability and alert summaries;
- encrypted backups selected by the owner;
- command/audit envelopes needed for remote operation.

Cloud by default does not receive:
- continuous indoor audio;
- continuous camera feeds;
- raw presence trajectories;
- local conversation history;
- food images or detailed household routines.

## Availability

- Hub caches entitlements and policies.
- Remote requests queue with short expirations.
- Local actions never wait on cloud.
- Cloud outage displays `REMOTE_UNAVAILABLE`, not a stale success state.

## Recommended production infrastructure

- Postgres with RLS and point-in-time recovery.
- Durable queue/event bus.
- Object storage for signed OTA and opt-in encrypted backup.
- HSM/KMS for signing and certificate lifecycle.
- TURN service for networks where direct WebRTC is unavailable.
- Central observability with tenant-safe redaction.
- Separate production, staging, and manufacturing environments.
