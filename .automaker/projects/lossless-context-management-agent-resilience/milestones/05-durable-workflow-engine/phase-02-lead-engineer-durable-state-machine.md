# Phase 2: Lead Engineer Durable State Machine

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Refactor LeadEngineerService to use checkpoint store. Checkpoint before each transition. Suspend at REVIEW and MERGE states. Resume from checkpoint on server restart. Background persist queue with retry. Fixes stale context trap.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-service.ts`
- [ ] `apps/server/src/services/lead-engineer-state-machine.ts`
- [ ] `apps/server/src/index.ts`

### Verification

- [ ] State machine checkpoints before every transition
- [ ] Server restart resumes suspended workflows
- [ ] REVIEW and MERGE states suspend properly
- [ ] Stale context trap eliminated
- [ ] Background persist queue with retry
- [ ] Fast-path rules still work with durable state

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
