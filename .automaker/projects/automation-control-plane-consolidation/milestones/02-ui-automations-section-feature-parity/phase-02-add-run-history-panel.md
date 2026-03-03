# Phase 2: Add run history panel

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add an expandable section showing run history per automation. Calls GET /api/automations/:id/history. Displays startedAt, duration, status badge, error message, Langfuse trace link if traceId present. Add getAutomationHistory() to api.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/settings-view/automations/automation-history-panel.tsx`
- [ ] `apps/ui/src/components/views/settings-view/automations/automations-section.tsx`
- [ ] `apps/ui/src/lib/api.ts`

### Verification
- [ ] History shows up to 10 recent runs with timestamp, duration, status, error
- [ ] Trace link shows if traceId present
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
