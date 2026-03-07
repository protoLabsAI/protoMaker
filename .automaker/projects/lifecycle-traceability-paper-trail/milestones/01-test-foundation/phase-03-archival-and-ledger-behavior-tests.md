# Phase 3: Archival and ledger behavior tests

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write tests for: (1) ArchivalService — verify it deletes feature directory contents (agent-output.md, handoffs, feature.json) after retention window, documenting data loss. (2) LedgerService — verify it only writes entries for done/verified features, proving failed features have no record. (3) FeatureLoader.update() — verify status changes ARE recorded in statusHistory[] but feature:status-changed event is NOT auto-emitted (documenting the gap). These tests establish the baseline before fixes.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/services/archival-service.test.ts`
- [ ] `apps/server/tests/unit/services/ledger-service.test.ts`
- [ ] `apps/server/tests/unit/services/feature-loader-events.test.ts`

### Verification
- [ ] Archival test proves feature directory is deleted after retention
- [ ] Ledger test proves only done/verified features get entries (failed features skipped)
- [ ] FeatureLoader test proves statusHistory is appended on status change
- [ ] FeatureLoader test proves feature:status-changed is NOT emitted by update() (documents gap)
- [ ] All tests pass with npm run test:server

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
