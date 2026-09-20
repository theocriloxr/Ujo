# September foundation changes

Status: IN_PROGRESS. Software evidence only; no hardware or release claim.

The legacy `/api/v1/execute` route now enforces the cross-product request schema before any device lookup or control. Extra caller approval fields, invalid state/IDs, unexpected parameters and `power_state` are rejected. Manual power selection remains an explicit local administration capability, not a bridge action. `list_nodes` returns stored registry IDs; it no longer fabricates a local node. The device service still owns safety/access policy and pending approval.

Development defaults to `127.0.0.1`; set `UJO_LISTEN_HOST` deliberately for LAN testing. Do not expose known development credentials. Production retains its configured-secret checks.

`GET /v1/environment/state` is an optional CRILOX scoped-identity resource. Provision `UJO_IDENTITY_TRUST_FILE` with locally authorized members and public signing keys before use. Missing configuration returns 503. It is not a working SSO issuer or account activation flow. See the coordination CRILOX_IDENTITY_CONTRACT.md. The local session API remains available without Internet.

Run `npm run check` for generation, typecheck, tests and build. A stale generated Prisma client can pass parts of `check:offline` while failing at runtime; generate the client after schema changes. The isolated audit demo exposed and repaired that local generated-client mismatch without touching existing databases.

GitHub Actions now defines core verification/SBOM and an opt-in Windows desktop compile job. Workflow source is IMPLEMENTED_UNTESTED until a remote run is recorded. The local desktop compile cannot resolve uncached Tauri in offline mode; no SDKs/crates were installed locally. No signed installer is produced or implied.
