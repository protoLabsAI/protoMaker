# Phase 2: Cascading Condensation

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement multi-depth condensation: when depth N summaries accumulate beyond condensedMinFanout, create depth N+1 summary. Depth-aware prompts: D1 preserves session decisions, D2+ preserves trajectory only. Configurable incrementalMaxDepth.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/compaction/condensation.ts`
- [ ] `libs/context-engine/src/compaction/prompts.ts`

### Verification
- [ ] Condensation creates depth N+1 from N-level summaries
- [ ] D1 prompts preserve session decisions
- [ ] D2+ prompts preserve only trajectory and durable decisions
- [ ] incrementalMaxDepth config respected
- [ ] Context items updated after condensation
- [ ] DAG remains valid (no cycles)

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
