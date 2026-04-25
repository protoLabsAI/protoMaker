---
name: rollcall
description: Fleet smoke test. Reports status of all agents (local + remote), AI infrastructure, media stack, and monitoring services.
model: haiku
---

Run the agent roll call smoke test. Reports container status, A2A agent card, and endpoint health for the entire homelab fleet.

## Steps

1. Run `bash "$(git rev-parse --show-toplevel)/scripts/agent-rollcall.sh"`
2. Report the output to the user
3. If any services are down, suggest remediation steps
