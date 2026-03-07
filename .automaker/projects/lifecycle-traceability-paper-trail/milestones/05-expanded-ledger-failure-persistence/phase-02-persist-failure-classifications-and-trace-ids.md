# Phase 2: Persist failure classifications and trace IDs

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update Feature type to add: failureClassification?: { category, confidence, recoveryStrategy, retryable, timestamp } and traceIds?: string[] (array of all Langfuse trace IDs, not just last). In lead-engineer-escalation.ts, persist the FailureClassifierService result to feature.failureClassification via featureLoader.update(). In execution-service.ts, append new trace IDs to feature.traceIds[] instead of overwriting lastTraceId. Keep lastTraceId for backward compat but populate traceIds[] as the canonical source.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/feature.ts`
- [ ] `apps/server/src/services/lead-engineer-escalation.ts`
- [ ] `apps/server/src/services/auto-mode/execution-service.ts`
- [ ] `apps/server/src/services/feature-loader.ts`

### Verification
- [ ] Feature type has optional failureClassification field
- [ ] Feature type has optional traceIds string array
- [ ] EscalateProcessor persists failure classification to feature.json
- [ ] Execution service appends trace IDs to traceIds[] array
- [ ] lastTraceId still set for backward compatibility
- [ ] npm run build:packages passes
- [ ] npm run typecheck passes

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
