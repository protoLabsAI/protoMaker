# Phase 1: delegate_to_pm tool implementation

*Ava Delegation Architecture > Ava Delegation + Slim Down*

Add delegate_to_pm tool to ava-tools.ts. Takes projectSlug + question. Creates a one-shot PM chat completion using PM's full tool surface and project context. Direct function call to PM chat handler (not backchannel). Returns PM's text response to Ava. Include timeout (60s) and error handling.

**Complexity:** large

## Files to Modify

- apps/server/src/routes/chat/ava-tools.ts
- apps/server/src/routes/project-pm/pm-agent.ts

## Acceptance Criteria

- [ ] delegate_to_pm tool registered in ava-tools
- [ ] Tool calls PM with full context and tools
- [ ] PM response returned to Ava within timeout
- [ ] Errors handled gracefully
- [ ] Build passes