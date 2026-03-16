# Phase 1: Delete flow-graph pipeline components and update registries

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete from apps/ui/src/components/views/flow-graph/: pipeline-panel.tsx, pipeline-analytics.tsx, pipeline-event-log.tsx, pipeline-pill-selector.tsx, pipeline-progress-bar.tsx, dialogs/pipeline-monitor.tsx, edges/pipeline-edge.tsx, nodes/pipeline-stage-node.tsx, hooks/use-pipeline-progress.ts, hooks/use-pipeline-tracker.ts. Update barrel exports: edges/index.ts (remove pipeline-edge), nodes/index.ts (remove pipeline-stage-node), hooks/index.ts (remove pipeline hooks). Update flow-graph-view.tsx to remove imports/usage of deleted components. Update flow-graph/types.ts to remove pipeline-specific node/edge type definitions.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/flow-graph/pipeline-panel.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/pipeline-analytics.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/pipeline-event-log.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/pipeline-pill-selector.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/pipeline-progress-bar.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/dialogs/pipeline-monitor.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/edges/pipeline-edge.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/nodes/pipeline-stage-node.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/hooks/use-pipeline-progress.ts`
- [ ] `apps/ui/src/components/views/flow-graph/hooks/use-pipeline-tracker.ts`
- [ ] `apps/ui/src/components/views/flow-graph/edges/index.ts`
- [ ] `apps/ui/src/components/views/flow-graph/nodes/index.ts`
- [ ] `apps/ui/src/components/views/flow-graph/hooks/index.ts`
- [ ] `apps/ui/src/components/views/flow-graph/flow-graph-view.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/types.ts`

### Verification

- [ ] All 10 pipeline component/hook files deleted
- [ ] Barrel exports have no dead references
- [ ] flow-graph-view.tsx imports no deleted components
- [ ] types.ts has no pipeline node/edge types
- [ ] npm run build passes

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
