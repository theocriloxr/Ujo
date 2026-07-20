#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "device_profile.h"

#if defined(UJO_PROFILE_ENERGY)
#include <PZEM004Tv30.h>
HardwareSerial pzemSerial(2);
PZEM004Tv30 pzem(pzemSerial, UJO_PZEM_RX_PIN, UJO_PZEM_TX_PIN);
void setupDeviceProfile() {}
void appendProfileTelemetry(JsonDocument &p) {
  const float voltage = pzem.voltage(), current = pzem.current(), power = pzem.power();
  p["profile"] = "energy";
  if (!isnan(voltage)) p["voltageV"] = voltage * UJO_VOLTAGE_CALIBRATION;
  if (!isnan(current)) p["currentA"] = current * UJO_CURRENT_CALIBRATION;
  if (!isnan(power)) p["powerW"] = power * UJO_POWER_CALIBRATION;
  const float energy = pzem.energy(), frequency = pzem.frequency(), factor = pzem.pf();
  if (!isnan(energy)) p["energyKwh"] = energy;
  if (!isnan(frequency)) p["frequencyHz"] = frequency;
  if (!isnan(factor)) p["powerFactor"] = factor;
}
bool handleProfileCommand(const String &action, JsonObjectConst, String &message) {
  if (action != "reset_energy_counter") return false;
  pzem.resetEnergy(); message = "energy-counter-reset"; return true;
}

#elif defined(UJO_PROFILE_WATER)
volatile uint32_t flowPulses = 0;
void IRAM_ATTR countFlowPulse() { flowPulses++; }
void setupDeviceProfile() {
  pinMode(UJO_TANK_TRIGGER_PIN, OUTPUT); pinMode(UJO_TANK_ECHO_PIN, INPUT);
  pinMode(UJO_FLOW_PIN, INPUT_PULLUP); pinMode(UJO_LEAK_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(UJO_FLOW_PIN), countFlowPulse, FALLING);
}
void appendProfileTelemetry(JsonDocument &p) {
  digitalWrite(UJO_TANK_TRIGGER_PIN, LOW); delayMicroseconds(2);
  digitalWrite(UJO_TANK_TRIGGER_PIN, HIGH); delayMicroseconds(10); digitalWrite(UJO_TANK_TRIGGER_PIN, LOW);
  const unsigned long duration = pulseIn(UJO_TANK_ECHO_PIN, HIGH, 30000);
  const float distanceCm = duration ? duration * 0.0343f / 2.0f : -1.0f;
  noInterrupts(); const uint32_t pulses = flowPulses; flowPulses = 0; interrupts();
  p["profile"] = "water"; p["distanceCm"] = distanceCm;
  if (distanceCm >= 0) p["tankLevelPercent"] = constrain(100.0f * (UJO_TANK_EMPTY_DISTANCE_CM - distanceCm) / (UJO_TANK_EMPTY_DISTANCE_CM - UJO_TANK_FULL_DISTANCE_CM), 0.0f, 100.0f);
  p["flowLitresPerMinute"] = pulses * (60000.0f / UJO_TELEMETRY_INTERVAL_MS) / UJO_FLOW_PULSES_PER_LITRE;
  p["leakDetected"] = digitalRead(UJO_LEAK_PIN) == UJO_LEAK_ACTIVE_LEVEL;
}
bool handleProfileCommand(const String &, JsonObjectConst, String &) { return false; }

#elif defined(UJO_PROFILE_FOOD)
#include <Adafruit_BME280.h>
#include <Adafruit_SGP40.h>
#include <OneWire.h>
#include <DallasTemperature.h>
Adafruit_BME280 bme; Adafruit_SGP40 sgp;
OneWire oneWire(UJO_DS18B20_PIN); DallasTemperature probe(&oneWire);
void setupDeviceProfile() { Wire.begin(); bme.begin(UJO_BME280_ADDRESS); sgp.begin(); probe.begin(); }
void appendProfileTelemetry(JsonDocument &p) {
  probe.requestTemperatures(); const float temperature = probe.getTempCByIndex(0);
  const float humidity = bme.readHumidity();
  p["profile"] = "food-environment"; p["temperatureC"] = temperature; p["humidityPercent"] = humidity;
  p["pressureHpa"] = bme.readPressure() / 100.0f;
  p["vocRaw"] = sgp.measureRaw(temperature, humidity);
  p["gasSignalMeaning"] = "non-selective-voc-trend-not-ethylene-or-food-safety";
#ifdef UJO_ETHYLENE_ANALOG_PIN
  p["ethyleneSensorRaw"] = analogRead(UJO_ETHYLENE_ANALOG_PIN);
  p["ethyleneCalibrated"] = false;
#endif
}
bool handleProfileCommand(const String &, JsonObjectConst, String &) { return false; }

#elif defined(UJO_PROFILE_PRESENCE)
void setupDeviceProfile() { pinMode(UJO_RADAR_OCCUPANCY_PIN, INPUT_PULLDOWN); }
void appendProfileTelemetry(JsonDocument &p) {
  p["profile"] = "presence";
  p["occupied"] = digitalRead(UJO_RADAR_OCCUPANCY_PIN) == UJO_RADAR_OCCUPIED_LEVEL;
  p["sensorPrivacy"] = "mmwave-binary-presence-no-camera";
}
bool handleProfileCommand(const String &, JsonObjectConst, String &) { return false; }

#else
void setupDeviceProfile() {}
void appendProfileTelemetry(JsonDocument &p) { p["profile"] = "generic"; p["analogRaw"] = analogRead(UJO_ANALOG_SENSOR_PIN); }
bool handleProfileCommand(const String &, JsonObjectConst, String &) { return false; }
#endif
