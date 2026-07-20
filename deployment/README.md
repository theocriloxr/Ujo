# Production deployment prerequisites

Before `docker compose up -d`, create a deployment `.env` from `.env.example`, replace every sample secret, and place these PEM files in `deployment/mosquitto/certs/`:

- `ca.crt`: private CA certificate copied to the hub and every ESP32 node
- `server.crt`: broker certificate whose SAN contains the hub hostname/IP
- `server.key`: broker private key; restrict it to the deployment administrator

Generate secrets with a cryptographically secure password manager or `openssl rand -hex 32`. Never reuse a node HMAC key. Start the standard hub and broker with `docker compose up -d`; include local AI with `docker compose --profile ai up -d`, then run `docker exec ujo-ollama ollama pull qwen3:4b` (or the model selected for the hub profile).

The container applies checked-in Prisma migrations and refuses weak/missing production secrets. It does not use destructive schema synchronization.
