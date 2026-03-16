# Phase 1: Add per-feature mutex to FeatureLoader update and claim

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

FeatureLoader.update() performs read-modify-write without locking. Two concurrent updates silently lose data. Add a Map of Promise chains keyed by projectPath::featureId that serializes update() calls. Also fix the claim() TOCTOU by wrapping it in the same mutex.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/feature-loader.ts`
- [ ] `apps/server/tests/unit/services/feature-loader.test.ts`

### Verification

- [ ] Concurrent update() calls for same feature are serialized
- [ ] claim() is atomic - two simultaneous claims cannot both succeed
- [ ] Unit test fires concurrent updates verifying all fields present
- [ ] npm run test:server passes

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
