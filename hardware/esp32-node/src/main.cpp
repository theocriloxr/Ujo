#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <mbedtls/md.h>
#include <time.h>
#include "config.h"
#include "device_profile.h"

WiFiClientSecure tlsClient;
PubSubClient mqtt(tlsClient);
Preferences preferences;
uint32_t outboundSequence = 0;
uint32_t highestCommandSequence = 0;
unsigned long lastTelemetryAt = 0;

String hmacSha256(const String &input) {
  byte digest[32];
  mbedtls_md_context_t context;
  mbedtls_md_init(&context);
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_setup(&context, info, 1);
  mbedtls_md_hmac_starts(&context, reinterpret_cast<const unsigned char *>(UJO_NODE_SECRET), strlen(UJO_NODE_SECRET));
  mbedtls_md_hmac_update(&context, reinterpret_cast<const unsigned char *>(input.c_str()), input.length());
  mbedtls_md_hmac_finish(&context, digest);
  mbedtls_md_free(&context);
  char hex[65];
  for (size_t index = 0; index < 32; index++) sprintf(hex + index * 2, "%02x", digest[index]);
  hex[64] = '\0';
  return String(hex);
}

String signingInput(const char *type, uint32_t sequence, uint32_t timestamp, JsonObjectConst payload) {
  String payloadJson;
  serializeJson(payload, payloadJson);
  return String(UJO_NODE_ID) + "|" + sequence + "|" + timestamp + "|" + type + "|" + payloadJson;
}

void setRelay(bool on) {
  digitalWrite(UJO_RELAY_PIN, (on == UJO_RELAY_ACTIVE_HIGH) ? HIGH : LOW);
}

bool publishEnvelope(const char *type, JsonDocument &payload, bool retained = false) {
  const uint32_t timestamp = static_cast<uint32_t>(time(nullptr));
  outboundSequence++;
  preferences.putUInt("outSeq", outboundSequence);
  JsonDocument envelope;
  envelope["v"] = 1;
  envelope["nodeId"] = UJO_NODE_ID;
  envelope["seq"] = outboundSequence;
  envelope["timestamp"] = timestamp;
  envelope["type"] = type;
  envelope["payload"] = payload.as<JsonObject>();
  envelope["signature"] = hmacSha256(signingInput(type, outboundSequence, timestamp, payload.as<JsonObjectConst>()));
  String serialized;
  serializeJson(envelope, serialized);
  const String topic = String("ujo/v1/nodes/") + UJO_NODE_ID + "/" + type;
  return mqtt.publish(topic.c_str(), serialized.c_str(), retained);
}

void acknowledge(const String &commandId, bool success, const char *message) {
  JsonDocument payload;
  payload["commandId"] = commandId;
  payload["success"] = success;
  payload["message"] = message;
  publishEnvelope("ack", payload);
}

void handleCommand(char *, byte *bytes, unsigned int length) {
  JsonDocument envelope;
  if (deserializeJson(envelope, bytes, length) != DeserializationError::Ok) return;
  if (envelope["v"] != 1 || envelope["nodeId"] != UJO_NODE_ID || envelope["type"] != "command") return;
  const uint32_t sequence = envelope["seq"] | 0;
  const uint32_t timestamp = envelope["timestamp"] | 0;
  if (sequence <= highestCommandSequence || abs(static_cast<long>(time(nullptr) - timestamp)) > 120) return;
  JsonObjectConst payload = envelope["payload"].as<JsonObjectConst>();
  const String expected = hmacSha256(signingInput("command", sequence, timestamp, payload));
  const String supplied = envelope["signature"] | "";
  if (expected.length() != supplied.length()) return;
  unsigned char difference = 0;
  for (size_t index = 0; index < expected.length(); index++) difference |= expected[index] ^ supplied[index];
  if (difference != 0) return;
  highestCommandSequence = sequence;
  preferences.putUInt("cmdSeq", highestCommandSequence);

  const String commandId = payload["commandId"] | "unknown";
  const String action = payload["action"] | "";
  if (action == "set_relay" && payload["value"].is<bool>()) {
    setRelay(payload["value"].as<bool>());
    acknowledge(commandId, true, "relay-updated");
  } else {
    String message;
    if (handleProfileCommand(action, payload, message)) acknowledge(commandId, true, message.c_str());
    else acknowledge(commandId, false, "unsupported-command");
  }
}

void connectMqtt() {
  while (!mqtt.connected()) {
    const String clientId = String(UJO_NODE_ID) + "-" + String(ESP.getEfuseMac(), HEX);
    if (mqtt.connect(clientId.c_str(), UJO_MQTT_USERNAME, UJO_MQTT_PASSWORD)) {
      const String commandTopic = String("ujo/v1/nodes/") + UJO_NODE_ID + "/command";
      mqtt.subscribe(commandTopic.c_str(), 1);
      JsonDocument status;
      status["online"] = true;
      status["nodeKind"] = UJO_NODE_KIND;
      status["room"] = UJO_ROOM;
      status["firmwareVersion"] = UJO_FIRMWARE_VERSION;
      status["resetReason"] = static_cast<int>(esp_reset_reason());
      publishEnvelope("status", status, true);
    } else {
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(UJO_RELAY_PIN, OUTPUT);
  setRelay(UJO_FAILSAFE_RELAY_ON);
  setupDeviceProfile();
  preferences.begin("ujo", false);
  outboundSequence = preferences.getUInt("outSeq", 0);
  highestCommandSequence = preferences.getUInt("cmdSeq", 0);
  WiFiManager wifiManager;
  wifiManager.setConfigPortalTimeout(180);
  if (!wifiManager.autoConnect(UJO_NODE_ID)) ESP.restart();
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  tlsClient.setCACert(UJO_MQTT_CA);
  mqtt.setServer(UJO_MQTT_HOST, UJO_MQTT_PORT);
  mqtt.setCallback(handleCommand);
  mqtt.setBufferSize(2048);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setRelay(UJO_FAILSAFE_RELAY_ON);
    delay(500);
    return;
  }
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
  if (millis() - lastTelemetryAt >= UJO_TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = millis();
    JsonDocument payload;
    payload["kind"] = UJO_NODE_KIND;
    payload["room"] = UJO_ROOM;
    payload["firmwareVersion"] = UJO_FIRMWARE_VERSION;
    payload["wifiRssi"] = WiFi.RSSI();
    payload["uptimeSeconds"] = millis() / 1000;
    appendProfileTelemetry(payload);
    publishEnvelope("telemetry", payload);
  }
}
