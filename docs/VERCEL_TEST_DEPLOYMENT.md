# Vercel deployment and login guide

## Why the previous login failed

The earlier deployment contained only the Vite static site. The login form called `/api/auth/login`, but the Express hub that owns that endpoint was not running on Vercel. The new `api/gateway.ts` function fixes the missing API boundary.

Vercel is now supported in two modes:

- **Preview mode** — authenticates with Vercel environment variables and returns a read-only demonstration home. It proves the UI, routing and login work without claiming that physical equipment exists.
- **Proxy mode** — forwards authenticated application requests to a fixed HTTPS Ujo hub URL. The hub remains the system of record and hardware authority.

## Deploy a working read-only preview

1. Push this repository to a private GitHub repository. Do not commit `.env`, generated MQTT certificates, node secrets, model files or databases.
2. In Vercel, import the repository and keep the repository root as the project root.
3. Set the framework preset to Vite if Vercel does not detect it.
4. In **Project Settings → Environment Variables**, add these to Preview and Production:

```text
VITE_UJO_GATEWAY=true
UJO_GATEWAY_MODE=preview
UJO_GATEWAY_JWT_SECRET=<at least 32 random characters>
UJO_PREVIEW_ADMIN_EMAIL=<your login email>
UJO_PREVIEW_ADMIN_PASSWORD=<at least 12 characters>
```

Generate the JWT secret locally:

```bash
openssl rand -hex 32
```

5. Redeploy after setting `VITE_UJO_GATEWAY`; Vite variables are embedded at build time.
6. Open the deployment, leave **Hub URL** blank, and sign in with the preview email/password.
7. Verify:

```text
https://YOUR-DEPLOYMENT.vercel.app/api/gateway?path=%2Fapi%2Fhealth
```

It should return `mode: preview`. The dashboard will be read-only by design.

## Connect Vercel to the real hub

1. Install the hub and verify local login first.
2. Create a stable outbound-only HTTPS tunnel to `http://ujo-core:3000`. The included Compose `remote` profile accepts a remotely managed Cloudflare Tunnel token. Configure the tunnel's public hostname in Cloudflare to target `http://ujo-core:3000`. Protect that hostname with Cloudflare Access and a service-token policy so it is not a public login surface.
3. On the hub, add the Vercel origin to `APP_ORIGINS`, for example:

```text
APP_ORIGINS=http://ujo-home.local:3000,http://192.168.1.20:3000,capacitor://localhost,https://YOUR-DEPLOYMENT.vercel.app
```

4. Set the hub's `CLOUDFLARE_TUNNEL_TOKEN`, then start:

```bash
docker compose --profile ai --profile voice --profile remote up -d
```

5. In Vercel, replace the gateway settings:

```text
VITE_UJO_GATEWAY=true
UJO_GATEWAY_MODE=proxy
UJO_REMOTE_HUB_URL=https://hub.example.com
UJO_GATEWAY_TIMEOUT_MS=30000
UJO_CF_ACCESS_CLIENT_ID=<Cloudflare Access service-token client ID>
UJO_CF_ACCESS_CLIENT_SECRET=<Cloudflare Access service-token secret>
```

6. Redeploy. Leave Hub URL blank in the sign-in screen. Login now uses the real hub account created by the installer.
7. Confirm `/api/health`, `/api/auth/me`, `/api/states`, and `/api/ai/status` before binding equipment.

## Direct LAN/mobile mode

At home, the PWA or Capacitor app can connect directly to `http://ujo-home.local:3000` during a controlled prototype. Production mobile releases should use a locally trusted HTTPS certificate or a secure app-to-hub trust mechanism; do not disable TLS verification globally.

## Troubleshooting

- **401 after deployment:** check the exact email/password environment values and redeploy after changing them.
- **Gateway configuration error:** confirm `UJO_GATEWAY_JWT_SECRET` has at least 32 characters.
- **Preview works but proxy returns 502:** Vercel cannot reach the hub URL; verify the tunnel, DNS, TLS certificate, Cloudflare Access service-token values and hub health.
- **Browser CORS error:** add the exact Vercel origin to the hub's `APP_ORIGINS`, then restart `ujo-core`.
- **UI still calls `/api/auth/login` directly:** verify `VITE_UJO_GATEWAY=true` was set before the build and trigger a fresh deployment.
- **Controls return 409:** either preview mode is active or the target device is not bound/confirmed. This is intentional fail-closed behavior.
- **Socket.IO is unavailable through the gateway:** the web client automatically polls `/api/states`. Direct hub clients still use Socket.IO.
