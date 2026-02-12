# Phase 3: Add Ava activation button

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a prominent 'Activate Ava' button/mode to the Agent Runner that pre-loads Ava's full system prompt (from ava.md skill), sets opus model, and connects to the Ava agent session. This is the UI equivalent of running /ava in CLI.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-view.tsx`
- [ ] `apps/server/src/services/agent-service.ts`

### Verification
- [ ] Ava activation button visible in Agent Runner
- [ ] Clicking loads Ava system prompt and opus model
- [ ] Can interact with Ava from UI the same as CLI
- [ ] Session persists across page reloads

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
