#!/bin/sh
set -eu
OLLAMA_HOST="${OLLAMA_HOST:-http://ollama:11434}"
export OLLAMA_HOST
PROFILE="${UJO_HUB_PROFILE:-mini}"

case "$PROFILE" in
  pi)
    BASE_MODEL="${UJO_ASSISTANT_BASE_MODEL:-qwen3:1.7b}"
    VISION_MODEL="${UJO_VISION_MODEL:-gemma3:1b}"
    ;;
  mini)
    BASE_MODEL="${UJO_ASSISTANT_BASE_MODEL:-qwen3:4b}"
    VISION_MODEL="${UJO_VISION_MODEL:-gemma3:4b}"
    ;;
  workstation)
    BASE_MODEL="${UJO_ASSISTANT_BASE_MODEL:-qwen3:8b}"
    VISION_MODEL="${UJO_VISION_MODEL:-gemma3:12b}"
    ;;
  *) echo "Unsupported UJO_HUB_PROFILE: $PROFILE" >&2; exit 2 ;;
esac
EMBED_MODEL="${UJO_EMBED_MODEL:-embeddinggemma}"
ASSISTANT_MODEL="${OLLAMA_MODEL:-ujo-assistant}"

until ollama list >/dev/null 2>&1; do sleep 2; done

echo "Pulling Ujo assistant base model: $BASE_MODEL"
ollama pull "$BASE_MODEL"
echo "Pulling Ujo embedding model: $EMBED_MODEL"
ollama pull "$EMBED_MODEL"
if [ "${UJO_ENABLE_VISION:-true}" = "true" ]; then
  echo "Pulling Ujo vision model: $VISION_MODEL"
  ollama pull "$VISION_MODEL"
fi

cat >/tmp/Ujo.Modelfile <<MODELFILE
FROM $BASE_MODEL
PARAMETER temperature 0.1
PARAMETER num_ctx ${UJO_OLLAMA_CONTEXT:-8192}
SYSTEM You are Ujo, an offline-first home assistant. You may explain state and propose typed actions, but you must never claim a physical action succeeded. Hardware control, identity, authorization, safety interlocks, approvals, and device confirmation are handled by deterministic Ujo services. Prefer concise, factual replies. When information is uncertain, say so. Never bypass user permissions or safety policy.
MODELFILE
ollama create "$ASSISTANT_MODEL" -f /tmp/Ujo.Modelfile
ollama list
