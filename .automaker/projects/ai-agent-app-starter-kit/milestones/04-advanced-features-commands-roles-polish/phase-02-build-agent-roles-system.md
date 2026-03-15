# Phase 2: Build agent roles system

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/server/src/roles/index.ts with AgentRole interface (id, name, systemPrompt, defaultModel). Create default assistant role and example code-reviewer role. Wire role selection into chat route. Create GET /api/roles endpoint. Add role selector to settings page.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/roles/index.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/roles/assistant.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/routes/roles.ts`

### Verification

- [ ] AgentRole interface with systemPrompt
- [ ] GET /api/roles returns available roles
- [ ] Role selection modifies system prompt
- [ ] Settings page allows role switching

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
