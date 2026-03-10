# Phase 1: Add agentic metrics to collection service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend MetricsCollectionService to track: (1) Autonomy rate — % of features reaching done without human intervention beyond approval gates, (2) Remediation loop count — PR iterations per feature, (3) Cost per shipped feature — LLM cost from Langfuse per feature, (4) WIP saturation index — current WIP / WIP limit per pipeline stage (execution, review, approval). Derive from existing events: feature:status-changed, agent:completed, pr:merged, pr:review-requested. Persist to `.automaker/metrics/agentic.json`.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/metrics-collection-service.ts`
- [ ] `libs/types/src/metrics.ts`

### Verification
- [ ] All 4 agentic metrics tracked
- [ ] Autonomy rate accurately reflects human intervention
- [ ] WIP saturation calculated per stage
- [ ] npm run build:server passes
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
