# Phase 2: Delete board-view pipeline components and clean API clients

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete from apps/ui/src/components/views/board-view/dialogs/: pipeline-settings-dialog.tsx, add-edit-pipeline-step-dialog.tsx, and the entire pipeline-step-templates/ directory (7 files). Remove imports of these dialogs from board-view.tsx and board-header.tsx. In apps/ui/src/lib/clients/engine-client.ts, remove the 5 pipeline endpoint methods (getPipelineState, getPipelineCheckpoints, getPipelineStatus, resolvePipelineGate, overridePipelinePhase). In apps/ui/src/lib/clients/system-client.ts, remove the 6 pipeline endpoint methods (getPipelineConfig, savePipelineConfig, addPipelineStep, updatePipelineStep, deletePipelineStep, reorderPipelineSteps). Delete apps/ui/src/store/pipeline-store.ts and apps/ui/src/hooks/queries/use-pipeline.ts.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/board-view/dialogs/pipeline-settings-dialog.tsx`
- [ ] `apps/ui/src/components/views/board-view/dialogs/add-edit-pipeline-step-dialog.tsx`
- [ ] `apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/`
- [ ] `apps/ui/src/components/views/board-view/board-view.tsx`
- [ ] `apps/ui/src/lib/clients/engine-client.ts`
- [ ] `apps/ui/src/lib/clients/system-client.ts`
- [ ] `apps/ui/src/store/pipeline-store.ts`
- [ ] `apps/ui/src/hooks/queries/use-pipeline.ts`

### Verification

- [ ] Pipeline dialog and template files deleted
- [ ] board-view.tsx has no pipeline dialog imports
- [ ] engine-client.ts has no pipeline endpoint methods
- [ ] system-client.ts has no pipeline endpoint methods
- [ ] pipeline-store.ts and use-pipeline.ts deleted
- [ ] npm run build passes

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
