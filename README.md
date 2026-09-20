# UJO bridge review source

This branch contains the public interoperability surface for the existing UJO
HTTP bridge: request schema, a dependency-free runtime client and synthetic tests.
It contains no hub, identity issuer, device provisioning, firmware or deployment
implementation. This branch has independent history; older repository branches
are not distributions of this SDK and are not erased by this reorganization.

This is **source for review**, not an open-source or published package release.
See [license status](LICENSE_STATUS.md). No commercial or redistribution clearance
is asserted. Node 22 and TypeScript 5.8.3 are used for checks.

```sh
npm ci
npm run check
```

```js
import { UjoBridgeClient } from './dist/index.js';
// Supply your own endpoint and scoped credential through secure application settings.
const client = new UjoBridgeClient({ baseUrl, token });
const reply = await client.execute({ action: 'get_state' });
```

The endpoint is an HTTPS origin. HTTP is accepted only for literal loopback
addresses or localhost during local development. URL credentials, query strings,
fragments and base paths are rejected. Tokens are sent only in Authorization.
The client rejects redirects, limits responses to 256,000 bytes and bounds the
whole request (including its body) to 15 seconds by default.

There are **no automatic retries**. A timeout, disconnect or caller cancellation
after a control request may leave its outcome unknown. Check authoritative state
before deciding what to do next; do not blindly resend physical commands.

`device_control` supports only `on` and `off`. UJO retains final authorization,
approval and physical control. HTTP 202 means pending/sent, not completed. Even a
200/COMPLETED response may describe simulation. `physicalVerified` is always false;
hardware evidence is outside the SDK. The client does not manufacture identities,
sign device commands, bypass approvals or interpret model output as authorization.

The version 1 contract may gain optional response fields. New actions or changed
semantics require a reviewed contract version. Request extensions fail closed.
State is returned as unknown data; consumers must validate their application view.
Do not pass state or credentials into untrusted logging or model contexts.

Tests run against an ephemeral loopback HTTP server with synthetic data. They
verify client transport and failure behavior, not physical devices or deployment.
