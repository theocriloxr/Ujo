#pragma once

// Copy this file to include/config.h and replace every placeholder.
#define UJO_NODE_ID "ujo-room-01"
#define UJO_NODE_SECRET "replace-with-a-unique-random-secret-of-at-least-32-characters"
#define UJO_NODE_KIND "relay-environment"
#define UJO_ROOM "Living Room"
#define UJO_FIRMWARE_VERSION "0.1.0"

#define UJO_MQTT_HOST "192.168.1.10"
#define UJO_MQTT_PORT 8883
#define UJO_MQTT_USERNAME "ujo-node"
#define UJO_MQTT_PASSWORD "replace-me"

// Paste the CA that signed the MQTT broker certificate.
static const char UJO_MQTT_CA[] = R"EOF(
-----BEGIN CERTIFICATE-----
REPLACE_WITH_YOUR_CA_CERTIFICATE
-----END CERTIFICATE-----
)EOF";

#define UJO_RELAY_PIN 26
#define UJO_RELAY_ACTIVE_HIGH true
#define UJO_FAILSAFE_RELAY_ON false
#define UJO_ANALOG_SENSOR_PIN 34
#define UJO_TELEMETRY_INTERVAL_MS 10000
