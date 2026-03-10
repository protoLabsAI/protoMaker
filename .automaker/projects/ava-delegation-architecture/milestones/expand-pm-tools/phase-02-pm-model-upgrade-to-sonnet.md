# Phase 2: PM model upgrade to Sonnet

*Ava Delegation Architecture > Expand PM Tool Surface*

Change PM chat route to use Sonnet by default instead of Haiku. Update transport config, system prompt to leverage Sonnet capabilities. Add extended thinking support for PM. Ensure model alias flows through from client header.

**Complexity:** small

## Files to Modify

- apps/server/src/routes/project-pm/index.ts
- apps/ui/src/hooks/use-pm-chat-session.ts

## Acceptance Criteria

- [ ] PM uses Sonnet by default
- [ ] x-model-alias header respected for PM chat
- [ ] Extended thinking enabled for PM on Sonnet/Opus
- [ ] Build passes