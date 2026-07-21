# Competitor and AI Benchmark → Ujo Product Requirements

This benchmark captures design patterns, not proprietary code or branding.

## Alexa / Alexa+

Adopt:
- proactive, cross-device experiences based on multiple sensor signals;
- seamless continuation between speakers, displays, phone, car, and browser;
- broad device interoperability and automated integration testing;
- natural routines that can be created conversationally.

Improve for Ujo:
- local/offline continuity as the default;
- an inspectable “why this happened” trace;
- custom wake words and personas;
- explicit opt-in for proactive behaviors;
- no cloud audio requirement for ordinary commands.

## Google Home / Gemini

Adopt:
- low-latency local Matter control;
- cross-platform mobile APIs and commissioning;
- suggested automations and proactive home services;
- developer/fleet “Vitals” for device quality and diagnostics;
- multimodal camera/event summaries where users enable them.

Improve for Ujo:
- keep a local deterministic policy engine as final authority;
- provide a vendor-neutral device abstraction;
- allow the home to function with zero cloud dependency;
- make model-generated automations drafts until validated and approved.

## Apple Home / Siri

Adopt:
- household roles, explicit accessory permissions, and secure home-hub boundaries;
- privacy-preserving local processing and clear camera/recording controls;
- consistent control across phone, watch, tablet, TV, desktop, and speakers;
- simple onboarding and recovery experiences.

Improve for Ujo:
- more open hardware support through Matter, Home Assistant, MQTT, Zigbee, and adapters;
- transparent automation explanations and audit history;
- customizable wake word, speech style, language, and personality.

## Home Assistant

Adopt:
- local ownership, open integrations, offline voice, and user-controlled hardware;
- integration-level device/entity modeling;
- an active open ecosystem instead of rebuilding every protocol;
- physical microphone mute and visible listening state for voice satellites.

Improve for Ujo:
- sell a curated, supported appliance and installation experience;
- add opinionated safety classes, approval workflows, predictive maintenance, infrastructure resilience, fleet health, and a polished ambient UI;
- use Home Assistant as one controller adapter, not the sole Ujo domain model.

## ChatGPT / OpenAI agent patterns

Adopt:
- typed tool definitions;
- strict structured arguments;
- tool traces and evaluations;
- separation between model reasoning and external actions;
- resumable conversations across devices.

Ujo rule:
- model output is a proposal; a policy service validates and executes it.
- the model cannot self-authorize a tool, bypass PIN/biometric checks, or claim a physical result.

## Gemini function-calling patterns

Adopt:
- schema-constrained function calls;
- explicit application-side execution;
- validation after structured generation;
- multimodal understanding for receipts, inventory, equipment labels, and optional camera events.

Ujo rule:
- vision and sensor inference must expose confidence and provenance; safety decisions require corroborating deterministic signals.

## Anthropic / MCP and permission patterns

Adopt:
- least-privilege tool permissions;
- allow/deny lists and plan/approval modes;
- a standard connector contract for tools and external services;
- clear visibility into which tool is about to run.

Ujo rule:
- each integration receives only the exact capability it needs. The desktop assistant, cloud service, technician portal, and local AI use distinct credentials and policy scopes.

## JARVIS / FRIDAY inspiration translated into real product behavior

- **Ambient presence:** room-aware voice routing, quiet hours, multimodal notifications.
- **Proactive assistance:** suggestions based on fresh evidence, not speculative chatter.
- **Operations layer:** diagnostics, incident triage, self-healing attempts, and rollback.
- **Executive brief:** morning/evening home brief covering safety, energy, water, inventory, maintenance, and pending approvals.
- **Explainability:** every intervention answers “what changed, why, what Ujo did, and how to undo it.”
- **Authority discipline:** FRIDAY/JARVIS personality changes communication style, never permissions.

## Ujo’s defendable differentiation

1. Offline-first ambient intelligence with deterministic physical control.
2. Explainable autonomy and user-selectable automation levels.
3. Infrastructure resilience: dirty power, generator/inverter/solar, water, connectivity, and backup power.
4. Universal health monitoring for both smart and “dumb” appliances.
5. Whole-home inventory and spoilage intelligence using receipts, shelf-life data, environmental trends, and optional vision.
6. Global protocol compatibility plus premium installation, maintenance, and fleet operations.
7. Privacy controls that show what is sensed, retained, inferred, shared, and deleted.
