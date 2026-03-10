# Phase 1: Clean up dead events and EventType gaps

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove dead emissions: gate:tuning-signal and retro:improvements:created from CeremonyActionExecutor. Add ceremony:trigger-requested to EventType union. Remove unsafe casts in 3 files. Remove legacy pm-epic-created listener from projm-agent.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ceremony-action-executor.ts`
- [ ] `libs/types/src/events.ts`
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/src/routes/project-pm/index.ts`
- [ ] `apps/server/src/routes/project-pm/pm-agent.ts`
- [ ] `apps/server/src/services/authority-agents/projm-agent.ts`

### Verification
- [ ] Dead event emissions removed
- [ ] ceremony:trigger-requested in EventType
- [ ] No unsafe casts for ceremony events
- [ ] Legacy listener removed
- [ ] npm run build:server passes

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
