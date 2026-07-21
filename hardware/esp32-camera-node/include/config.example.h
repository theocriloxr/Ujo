#pragma once
#define UJO_NODE_ID "ujo-fridge-camera-01"
#define UJO_NODE_SECRET "replace-with-unique-secret-at-least-32-characters"
#define UJO_HUB_HOST "ujo-home.local"
#define UJO_HUB_PORT 3000
#define UJO_HUB_TLS false
#define UJO_TRIGGER_PIN 13
#define UJO_TRIGGER_ACTIVE_LEVEL LOW
#define UJO_CAPTURE_COOLDOWN_MS 15000
#define UJO_MAX_JPEG_BYTES (1024 * 1024)

// Paste the CA that signs the HTTPS hub certificate when UJO_HUB_TLS=true.
static const char UJO_HUB_CA[] = R"EOF(
-----BEGIN CERTIFICATE-----
REPLACE_IF_TLS_IS_ENABLED
-----END CERTIFICATE-----
)EOF";
