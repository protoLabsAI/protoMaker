# Phase 2: Simplify use-flow-graph-data and flow-graph-view

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts to remove all pipeline tracker usage (remove usePipelineTracker import, remove pipeline stage node building, remove pipeline-related node position logic). The hook should build nodes from: engine status (service nodes for the production lane), running agents (dynamic agent nodes from app store), integration status (GitHub/Discord). Update apps/ui/src/components/views/flow-graph/flow-graph-view.tsx to remove panel imports that were deleted, keeping only: health-panel, metrics-panel, auto-mode-summary-panel. Update analytics-view.tsx if it references any deleted pipeline components.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts`
- [ ] `apps/ui/src/components/views/flow-graph/flow-graph-view.tsx`
- [ ] `apps/ui/src/components/views/analytics-view.tsx`

### Verification

- [ ] use-flow-graph-data.ts has no pipeline tracker or pipeline stage node code
- [ ] flow-graph-view.tsx renders with no deleted panel imports
- [ ] System view loads without runtime errors
- [ ] Running agents still appear as nodes
- [ ] Service health reflected in production lane nodes
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
