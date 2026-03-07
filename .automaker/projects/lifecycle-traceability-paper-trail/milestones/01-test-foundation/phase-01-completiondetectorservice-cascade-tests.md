# Phase 1: CompletionDetectorService cascade tests

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write unit tests for CompletionDetectorService covering: (1) feature done → epic completion check (epicId-based, currently works), (2) epic done → milestone completion check (milestoneSlug-based, currently BROKEN — test should fail proving the bug), (3) milestone done → project completion check, (4) full cascade: feature→epic→milestone→project→ceremony events emitted. Mock FeatureLoader, ProjectService, and EventEmitter. Test both paths: with milestoneSlug set (should cascade) and without (should NOT cascade — documenting current broken behavior).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/services/completion-detector-service.test.ts`

### Verification
- [ ] Test exists proving milestone cascade fails when milestoneSlug is missing (documents bug)
- [ ] Test exists proving milestone cascade succeeds when milestoneSlug is set (target behavior)
- [ ] Test proves epic completion works via epicId (existing working behavior)
- [ ] Test proves project:completed event emits when all milestones done
- [ ] Test proves ceremony:milestone:completed event emits on milestone completion
- [ ] All tests pass with npm run test:server

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
