# Phase 1: Persist and reload CompletionDetector dedup state

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a JSONL sidecar file (data/ledger/completion-emitted.jsonl) that records each emitted key when added to the in-memory Sets. On startup, load this file to pre-populate the Sets before subscribing to events. Use atomic appends consistent with EventLedgerService pattern. Write unit tests covering cold start and warm restart scenarios.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/completion-detector-service.ts`
- [ ] `apps/server/tests/unit/services/completion-detector-service.test.ts`

### Verification
- [ ] completion-emitted.jsonl is created and appended to on each completion event
- [ ] On startup with existing file emittedEpics/emittedMilestones/emittedProjects are pre-populated
- [ ] After reload duplicate completion events are suppressed
- [ ] Unit tests pass for cold start and warm restart scenarios
- [ ] Build passes

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
