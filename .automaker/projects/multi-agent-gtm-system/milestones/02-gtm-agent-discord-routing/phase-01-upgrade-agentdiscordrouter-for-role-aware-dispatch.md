# Phase 1: Upgrade AgentDiscordRouter for role-aware dispatch

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Modify AgentDiscordRouter.processMessage() to load role-specific system prompts from the prompts package based on routedToAgent type. Pass role-appropriate tools via ROLE_CAPABILITIES. Add conversation history for multi-turn Discord threads. Replace the generic one-liner system prompt with the actual role prompt.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/agent-discord-router.ts`

### Verification
- [ ] processMessage uses role-specific prompt from prompts package
- [ ] Tool restrictions from ROLE_CAPABILITIES enforced
- [ ] Multi-turn conversation in Discord threads
- [ ] Existing Ava routing still works

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
