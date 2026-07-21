#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <esp_camera.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>
#include <time.h>
#include "config.h"

Preferences preferences;
uint32_t sequenceNumber = 0;
unsigned long lastCaptureAt = 0;
int previousTrigger = !UJO_TRIGGER_ACTIVE_LEVEL;

String sha256Hex(const uint8_t *data, size_t length) {
  uint8_t digest[32];
  mbedtls_sha256(data, length, digest, 0);
  char hex[65];
  for (size_t i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", digest[i]);
  hex[64] = '\0';
  return String(hex);
}

String hmacHex(const String &input) {
  uint8_t digest[32];
  mbedtls_md_context_t context;
  mbedtls_md_init(&context);
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_setup(&context, info, 1);
  mbedtls_md_hmac_starts(&context, reinterpret_cast<const unsigned char *>(UJO_NODE_SECRET), strlen(UJO_NODE_SECRET));
  mbedtls_md_hmac_update(&context, reinterpret_cast<const unsigned char *>(input.c_str()), input.length());
  mbedtls_md_hmac_finish(&context, digest);
  mbedtls_md_free(&context);
  char hex[65];
  for (size_t i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", digest[i]);
  hex[64] = '\0';
  return String(hex);
}

bool configureCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0; config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5; config.pin_d1 = 18; config.pin_d2 = 19; config.pin_d3 = 21;
  config.pin_d4 = 36; config.pin_d5 = 39; config.pin_d6 = 34; config.pin_d7 = 35;
  config.pin_xclk = 0; config.pin_pclk = 22; config.pin_vsync = 25; config.pin_href = 23;
  config.pin_sccb_sda = 26; config.pin_sccb_scl = 27; config.pin_pwdn = 32; config.pin_reset = -1;
  config.xclk_freq_hz = 20000000; config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = psramFound() ? FRAMESIZE_SVGA : FRAMESIZE_VGA;
  config.jpeg_quality = psramFound() ? 12 : 16;
  config.fb_count = psramFound() ? 2 : 1;
  config.grab_mode = CAMERA_GRAB_LATEST;
  return esp_camera_init(&config) == ESP_OK;
}

bool sendSnapshot() {
  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame || frame->format != PIXFORMAT_JPEG || frame->len < 100 || frame->len > UJO_MAX_JPEG_BYTES) {
    if (frame) esp_camera_fb_return(frame);
    return false;
  }
  const uint32_t timestamp = static_cast<uint32_t>(time(nullptr));
  if (timestamp < 1700000000) { esp_camera_fb_return(frame); return false; }
  sequenceNumber++;
  preferences.putUInt("sequence", sequenceNumber);
  const String bodyHash = sha256Hex(frame->buf, frame->len);
  const String signature = hmacHex(String(UJO_NODE_ID) + "|" + sequenceNumber + "|" + timestamp + "|" + bodyHash);
  const String url = String(UJO_HUB_TLS ? "https://" : "http://") + UJO_HUB_HOST + ":" + UJO_HUB_PORT + "/hardware/v1/camera/" + UJO_NODE_ID;

  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure secure;
  if (UJO_HUB_TLS) { secure.setCACert(UJO_HUB_CA); http.begin(secure, url); }
  else http.begin(plain, url);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Ujo-Sequence", String(sequenceNumber));
  http.addHeader("X-Ujo-Timestamp", String(timestamp));
  http.addHeader("X-Ujo-Signature", signature);
  const int status = http.POST(frame->buf, frame->len);
  http.end();
  esp_camera_fb_return(frame);
  Serial.printf("Snapshot HTTP status: %d\n", status);
  return status == 201;
}

void setup() {
  Serial.begin(115200);
  pinMode(UJO_TRIGGER_PIN, INPUT_PULLUP);
  preferences.begin("ujo-camera", false);
  sequenceNumber = preferences.getUInt("sequence", 0);
  WiFiManager manager;
  manager.setConfigPortalTimeout(180);
  if (!manager.autoConnect(UJO_NODE_ID)) ESP.restart();
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  if (!configureCamera()) { Serial.println("Camera initialization failed"); delay(3000); ESP.restart(); }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) { delay(500); return; }
  const int current = digitalRead(UJO_TRIGGER_PIN);
  const bool closedTransition = previousTrigger != UJO_TRIGGER_ACTIVE_LEVEL && current == UJO_TRIGGER_ACTIVE_LEVEL;
  previousTrigger = current;
  if (closedTransition && millis() - lastCaptureAt >= UJO_CAPTURE_COOLDOWN_MS) {
    lastCaptureAt = millis();
    delay(500); // allow fridge/cabinet motion to settle
    sendSnapshot();
  }
  delay(25);
}
