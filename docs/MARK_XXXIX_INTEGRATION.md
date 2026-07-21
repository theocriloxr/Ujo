# MARK-XXXIX Integration Decision

## Keep

- desktop conversational shell and visual presence;
- authority/permission concepts;
- local Ollama client patterns;
- wake-word and voice UX experiments;
- memory concepts after privacy redesign;
- Ujo status/device-control adapter through the supplied safe bridge.

## Do not merge into the edge safety process

- arbitrary shell/process execution;
- filesystem mutation;
- Docker deployment tools;
- remote agent and swarm execution;
- self-modifying/self-evolution code;
- simulated biometric authentication;
- broad “computer control” tools;
- data-exfiltration/siphon modules;
- any component that can convert natural language directly into OS or physical commands.

Run the companion in a separate sandboxed process/account. It communicates with Ujo through a narrow, authenticated API. Ujo remains final authority.

## Required remediation before commercial use

1. Replace `actions/ujo_network.py` with the safe bridge patch.
2. Delete `config/api_keys.json` from source control and rotate every contained secret.
3. Add secret scanning and pre-commit/CI blocking.
4. Review the repository’s personal/non-commercial license statement and obtain commercial rights or reimplement the needed parts.
5. Add dependency/SBOM, malware, and static-analysis scans.
6. Make every tool permission-denied by default and require explicit allowlists.
7. Store memories encrypted, separated by household/user, with retention and deletion controls.
8. Never use voiceprint or face recognition as the sole authorization for locks, purchases, or administrator operations.
