#pragma once
#include <ArduinoJson.h>

void setupDeviceProfile();
void appendProfileTelemetry(JsonDocument &payload);
bool handleProfileCommand(const String &action, JsonObjectConst payload, String &message);
