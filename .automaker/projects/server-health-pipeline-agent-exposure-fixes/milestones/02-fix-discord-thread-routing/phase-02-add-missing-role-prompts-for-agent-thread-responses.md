# Phase 2: Add missing role prompts for agent thread responses

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

agent-discord-router.ts getRolePrompt() switch (lines 110-129) is missing cases for chief-of-staff and gtm-specialist. Since no built-in templates have systemPrompt set, the registry-first path (lines 101-108) won't find prompts, and these roles fall through to the generic fallback.

Two options (pick one):
Option A: Add systemPrompt fields to ava and gtm-specialist templates in built-in-templates.ts so the registry path works
Option B: Add cases in the getRolePrompt() switch in agent-discord-router.ts

Option A is better — it's the registry-driven approach and works for future templates too.

Files:
- apps/server/src/services/built-in-templates.ts — Add systemPrompt to ava and gtm-specialist templates
- Optionally: apps/server/src/services/agent-discord-router.ts — Add fallback cases

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/built-in-templates.ts`
- [ ] `apps/server/src/services/agent-discord-router.ts`

### Verification
- [ ] Ava and GTM specialist get their proper system prompts in thread conversations
- [ ] Registry-first path finds systemPrompt for templates that have it
- [ ] npm run build:server passes

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
