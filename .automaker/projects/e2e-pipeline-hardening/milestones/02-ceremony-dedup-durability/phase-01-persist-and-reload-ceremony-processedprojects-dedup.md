# Phase 1: Persist and reload ceremony processedProjects dedup

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a JSONL sidecar file (data/ledger/ceremony-processed.jsonl) that records each key added to processedProjects. On CeremonyService startup, load this file and pre-populate the Set. Use atomic appends. Write unit tests covering cold start and warm restart scenarios.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/tests/unit/services/ceremony-service.test.ts`

### Verification
- [ ] ceremony-processed.jsonl is created and appended to on each ceremony dedup key
- [ ] On startup with existing file processedProjects is pre-populated
- [ ] After reload ceremonies do not double-fire for already-processed projects
- [ ] Unit tests pass
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
