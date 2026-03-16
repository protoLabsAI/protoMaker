# Phase 3: Delete PipelineCheckpointService and remove featureFlags.pipeline

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete apps/server/src/services/pipeline-checkpoint-service.ts. Remove PipelineOrchestrator and PipelineCheckpointService instantiation from apps/server/src/server/services.ts. Remove the pipeline feature flag from: libs/types/src/global-settings.ts (FeatureFlags interface + DEFAULT_FEATURE_FLAGS), apps/ui/src/components/views/settings/developer-section.tsx (FEATURE_FLAG_LABELS record — the Record<keyof FeatureFlags, ...> type will enforce this). Remove all pipeline flag runtime checks from: hitl-form-service.ts, pm-agent.ts, em-agent.ts. Clean apps/server/src/routes/hitl-forms/routes/create.ts to remove pipeline-disabled error.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/pipeline-checkpoint-service.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/ui/src/components/views/settings/developer-section.tsx`
- [ ] `apps/server/src/services/hitl-form-service.ts`
- [ ] `apps/server/src/services/authority-agents/pm-agent.ts`
- [ ] `apps/server/src/services/authority-agents/em-agent.ts`
- [ ] `apps/server/src/routes/hitl-forms/routes/create.ts`

### Verification

- [ ] pipeline-checkpoint-service.ts deleted
- [ ] services.ts has no PipelineOrchestrator or PipelineCheckpointService
- [ ] FeatureFlags interface has no pipeline field
- [ ] DEFAULT_FEATURE_FLAGS has no pipeline key
- [ ] FEATURE_FLAG_LABELS has no pipeline entry
- [ ] npm run build:server passes
- [ ] npm run typecheck passes

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
