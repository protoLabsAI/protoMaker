# Phase 3: CeremonyService — LLM project retros

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add handleProjectCompleted to CeremonyService. Load all features across all milestones. Aggregate: what shipped (PR URLs, titles), failure patterns (features with failureCount > 0), cost breakdown per milestone. Call simpleQuery (from simple-query-service.ts) with a retro prompt: 'Given these project stats, write a concise retrospective covering: What Went Well, What Went Wrong, Lessons Learned, Action Items. Be specific, reference actual features and numbers. Keep it engaging.' Post the LLM response to Discord as the retro. Use ceremony model from settings (default sonnet).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ceremony-service.ts`

### Verification
- [ ] handleProjectCompleted loads all features and aggregates stats
- [ ] LLM is called via simpleQuery with retro prompt and feature data
- [ ] Retro includes What Shipped, What Went Well, What Went Wrong, Lessons, Action Items
- [ ] Output posted to Discord, split if needed
- [ ] Uses configurable ceremony model (default sonnet)

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
