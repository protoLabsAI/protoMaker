# Phase 1: Consolidate formatDuration, formatTimestamp, and formatElapsed

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create libs/utils/src/format-time.ts with formatDuration(ms), formatTimestamp(date), formatElapsed(ms). Replace all 12 formatDuration copies, 7 formatTimestamp copies, 3 formatElapsed copies across UI and libs with imports from @protolabsai/utils.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/utils/src/format-time.ts`
- [ ] `libs/utils/src/index.ts`
- [ ] `apps/ui/src/lib/dashboard-transforms.ts`
- [ ] `libs/ui/src/ai/tool-results/dynamic-agent-card.tsx`
- [ ] `libs/ui/src/ai/chain-of-thought.tsx`
- [ ] `libs/ui/src/ai/tool-results/running-agents-card.tsx`
- [ ] `libs/ui/src/ai/tool-results/agent-status-card.tsx`
- [ ] `apps/ui/src/components/views/analytics-view/velocity-panel.tsx`
- [ ] `apps/ui/src/components/views/dashboard-view/metrics/integrations-tab.tsx`
- [ ] `apps/ui/src/components/views/dashboard-view/metrics/kpi-cards.tsx`
- [ ] `apps/ui/src/components/views/dashboard-view/metrics/blocked-timeline.tsx`
- [ ] `apps/ui/src/components/views/dashboard-view/event-feed.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/dialogs/node-detail-sections.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/dialogs/timeline-visualization.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/dialogs/pipeline-monitor.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/pipeline-analytics.tsx`
- [ ] `apps/ui/src/components/views/flow-graph/nodes/agent-node.tsx`
- [ ] `apps/ui/src/components/views/settings-view/automations/automation-history-panel.tsx`
- [ ] `apps/ui/src/components/shared/count-up-timer.tsx`

### Verification
- [ ] Single source for all three formatters in libs/utils/
- [ ] All copies replaced with imports
- [ ] npm run build:packages passes
- [ ] npm run typecheck passes

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
