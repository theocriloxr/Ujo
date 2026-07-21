# Ujo room voice satellite

The reference room endpoint uses an ESP32-S3-BOX-3 with the maintained ESPHome voice-assistant package. It keeps room audio on the local network and sends it to the home's local Assist pipeline. Configure that pipeline to use Ujo's local speech and assistant services; do not expose the ESPHome native API to the public internet.

## Build

1. Install ESPHome 2026.4 or newer.
2. Copy `secrets.example.yaml` to `secrets.yaml` and replace every value.
3. For reproducible production builds, replace `@main` in the package URL with a reviewed commit SHA.
4. Run `esphome run ujo-esp32-s3-box-3.yaml` and commission the device in Home Assistant.
5. In Home Assistant, select a fully local voice pipeline and disable cloud fallbacks unless the household explicitly opts in.

## Custom wake words

The satellite supports local microWakeWord models. A truly arbitrary custom wake phrase must be trained and evaluated as a keyword-spotting model before it is pushed to satellites. Ujo also includes a hub-side STT phrase-matching fallback for prototypes, but that consumes more power/bandwidth and is not a substitute for a validated low-power wake-word model.

Provide a hard microphone-mute control, visible listening indicator, and a physical push-to-talk fallback on production hardware. Record neither raw room audio nor transcripts by default.
