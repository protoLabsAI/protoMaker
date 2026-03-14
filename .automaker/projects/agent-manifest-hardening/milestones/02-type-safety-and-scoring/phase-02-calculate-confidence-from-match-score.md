# Phase 2: Calculate confidence from match score

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace the hardcoded confidence: 1.0 with a normalized score. Use a sigmoid or linear scale based on the raw match score (e.g., score / (score + 10) for diminishing returns). Return the score from matchFeature alongside the agent.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/agent-manifest-service.ts`
- [ ] `apps/server/src/services/auto-mode/execution-service.ts`

### Verification
- [ ] Confidence reflects actual match strength
- [ ] Low-score matches show lower confidence
- [ ] High-score matches approach 1.0
- [ ] Existing match ordering unchanged

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
