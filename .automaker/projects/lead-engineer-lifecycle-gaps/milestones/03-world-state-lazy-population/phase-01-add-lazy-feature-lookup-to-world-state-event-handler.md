# Phase 1: Add lazy feature lookup to world state event handler

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In lead-engineer-service.ts onEvent handler (around line 509-523), when a feature event references a featureId not in session.worldState.features, load the feature from disk via featureLoader.get() and add it to the world state map before evaluating rules. Add unit test confirming lazy load path.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/lead-engineer-service.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-service.test.ts`

### Verification
- [ ] Events for unknown features trigger lazy disk lookup
- [ ] Loaded features added to world state map
- [ ] Fast-path rules evaluate against lazily loaded features
- [ ] Unit test confirms lazy population
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
