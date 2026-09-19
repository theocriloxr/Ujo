# Working rules

Before making architectural changes:
1. Read `../coordination/MASTER_DIRECTIVE.md`.
2. Read `../coordination/MASTER_BUILD_STATE.md`.
3. Read `../coordination/CURRENT_SPRINT.md`.
4. Read this repository's README/docs and inspect current code before editing.

General requirements:
- Preserve verified existing behavior unless the master directive requires a migration.
- Never claim a task is complete without test evidence.
- Use only the statuses NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNTESTED, FAILED, BLOCKED, VERIFIED.
- Do not commit secrets, production credentials, private keys, tokens, certificates, or real user data.
- Prefer typed interfaces, explicit schemas, migrations, and tests.
- Add regression tests for fixed bugs where practical.
- Do not disable failing tests merely to obtain green CI.
- Do not fabricate telemetry, sensor readings, success states, security claims, or hardware readiness.
- Keep changes logically scoped and reviewable.
- Update `../coordination/MASTER_BUILD_STATE.md`, `REQUIREMENTS_TRACEABILITY.md`, `TEST_MATRIX.md`, and `DECISIONS.md` when the work materially changes them.
- Record architectural decisions in `../coordination/adr/`.
- When blocked by credentials, legal approval, certification, or physical hardware, implement the interfaces/simulator/tests/handoff and mark only the external dependency BLOCKED.

# UJO repository boundary

UJO is the local-first operating/orchestration platform for physical environments.

UJO owns:
- UJO Core, UJO OS, UJO Home, UJO Desktop/Mobile;
- sites, spaces, devices, sensors, actuators and environmental truth;
- physical policy, automations, scenes, energy, security and health;
- protocol bridges, simulator, firmware, OTA and factory tooling.

UJO must work without AUREL and without Internet for supported ordinary local control.

AUREL is optional intelligence beside UJO. It never becomes UJO's physical authority.

Local deterministic UJO operations and local AUREL inference consume 0 managed AUREL Credits.
