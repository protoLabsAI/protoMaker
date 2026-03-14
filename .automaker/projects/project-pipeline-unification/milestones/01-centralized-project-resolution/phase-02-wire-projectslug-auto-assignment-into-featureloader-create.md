# Phase 2: Wire projectSlug auto-assignment into FeatureLoader.create

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In FeatureLoader.create(), if the incoming feature data has no projectSlug, call the resolver to get one. This is the single choke point that all 18+ creation paths flow through, so fixing it here fixes everything.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/feature-loader.ts`

### Verification
- [ ] Features created without projectSlug get it auto-assigned
- [ ] Features created WITH projectSlug keep their explicit value
- [ ] Features where resolver returns undefined remain without projectSlug
- [ ] All existing tests pass

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
