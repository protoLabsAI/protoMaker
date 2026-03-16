# Phase 2: Configuration & Settings Wiring

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add context engine config to WorkflowSettings. Settings: contextEngine.enabled, freshTailCount, contextThreshold, leafMinFanout, condensedMinFanout, incrementalMaxDepth, leafChunkTokens, largeFileThreshold. UI controls in Settings. Disabled by default.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/types/src/workflow-settings.ts`
- [ ] `apps/server/src/services/settings-service.ts`
- [ ] `apps/ui/src/components/views/settings/workflow-settings.tsx`

### Verification

- [ ] Context engine settings in WorkflowSettings type
- [ ] Settings persisted to .automaker/settings.json
- [ ] UI controls in Settings page
- [ ] Disabled by default (enabled: false)
- [ ] Settings propagated to ContextEngine on init
- [ ] Defaults match lossless-claw proven values

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
