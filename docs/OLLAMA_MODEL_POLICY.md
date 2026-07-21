# Local AI and Ollama Model Policy

## Design

Use a model router, not one model for everything.

### Tier A — deterministic parser

For common commands such as lights, temperature, scenes, timers, inventory updates, and status questions, first use a grammar/intent parser. This gives the lowest latency and works on minimal hardware.

### Tier B — small local tool planner

Use a small tool-capable model to produce JSON proposals only. Validate against a schema and the Ujo policy engine before execution.

Recommended starting profiles (benchmark on target hardware before locking them):

- **Raspberry Pi 5 / 8 GB:** a compact command model such as `functiongemma:270m` after Ujo-specific fine-tuning for routing, plus deterministic intents. It is not the conversational model.
- **Entry hub / 16 GB RAM:** `qwen3:4b` or a comparably sized current tool-capable model for conversation and planning.
- **Premium x86/Apple-silicon/NVIDIA hub:** a current 7B–14B quantized tool-capable model, selected by measured latency, memory, multilingual quality, and function-call accuracy.
- **Optional cloud escalation:** only with explicit user policy, redaction, purpose limitation, and visible status. The cloud model may improve reasoning but still cannot bypass the local policy engine.

Do not hard-code a forever “best model.” Maintain a signed model manifest with minimum hub profile, hash, license, safety evaluation, supported languages, tool-call score, memory requirement, and rollback model.

## Required model evaluations

- exact tool and argument accuracy;
- refusal to operate locks/payments through ordinary voice;
- prompt-injection resistance from camera OCR, receipts, websites, and device names;
- multilingual/accent performance;
- hallucinated-device rate;
- stale-state handling;
- noisy-room voice performance;
- latency and thermals under concurrent STT/TTS/vision;
- no-network cold start and restart;
- regression tests for every supported intent.

## Voice pipeline

1. Local wake-word detector on each satellite or hub.
2. Voice activity detection and echo cancellation.
3. Local STT adapter.
4. Deterministic/LLM intent proposal.
5. Policy validation and, where needed, step-up approval.
6. Tool execution.
7. Reported-state confirmation.
8. Local TTS response stating actual status: completed, pending, rejected, unavailable, or failed.

Custom wake words must be trained/enrolled locally, versioned, revocable, and protected from accidental activation tests.
