#pragma once

// Copy this file to include/config.h and replace every placeholder.
#define UJO_NODE_ID "ujo-room-01"
#define UJO_NODE_SECRET "replace-with-a-unique-random-secret-of-at-least-32-characters"
#define UJO_NODE_KIND "relay-environment"
#define UJO_ROOM "Living Room"
#define UJO_FIRMWARE_VERSION "0.1.0"

#define UJO_MQTT_HOST "192.168.1.10"
#define UJO_MQTT_PORT 8883
#define UJO_MQTT_USERNAME UJO_NODE_ID
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

// Profile pins and calibration. Only the selected PlatformIO environment uses each block.
#define UJO_PZEM_RX_PIN 16
#define UJO_PZEM_TX_PIN 17
#define UJO_VOLTAGE_CALIBRATION 1.0f
#define UJO_CURRENT_CALIBRATION 1.0f
#define UJO_POWER_CALIBRATION 1.0f

#define UJO_TANK_TRIGGER_PIN 27
#define UJO_TANK_ECHO_PIN 35
#define UJO_FLOW_PIN 25
#define UJO_LEAK_PIN 33
#define UJO_LEAK_ACTIVE_LEVEL LOW
#define UJO_TANK_FULL_DISTANCE_CM 20.0f
#define UJO_TANK_EMPTY_DISTANCE_CM 180.0f
#define UJO_FLOW_PULSES_PER_LITRE 450.0f

#define UJO_BME280_ADDRESS 0x76
#define UJO_DS18B20_PIN 4
// #define UJO_ETHYLENE_ANALOG_PIN 34 // Only for a separately calibrated, selective sensor.

#define UJO_RADAR_OCCUPANCY_PIN 32
#define UJO_RADAR_OCCUPIED_LEVEL HIGH
