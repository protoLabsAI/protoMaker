# Phase 2: Changelog persistence + escalation artifact recording

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. Write failing tests for: (1) ChangelogService persisting its generated changelog as a 'changelog' artifact via ProjectArtifactService. (2) On escalation:signal-received event, record an 'escalation' artifact containing the signal, reason, and feature context. Implement both. The changelog test should verify the artifact appears in the index after a milestone:completed event. The escalation test should verify artifacts are created for each escalation.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/changelog-service.ts`
- [ ] `apps/server/src/services/event-ledger-service.ts`
- [ ] `apps/server/tests/unit/services/changelog-artifact.test.ts`

### Verification
- [ ] ChangelogService writes changelogs as project artifacts after milestone:completed and project:completed
- [ ] Escalation events create escalation artifacts on the project
- [ ] All artifacts appear in the project artifact index
- [ ] Unit tests verify artifact creation for both cases
- [ ] Build passes

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
