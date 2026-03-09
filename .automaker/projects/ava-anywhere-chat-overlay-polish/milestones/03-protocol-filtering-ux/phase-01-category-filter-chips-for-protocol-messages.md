# Phase 1: Category Filter Chips for Protocol Messages

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In ava-channel-tab.tsx, replace or augment the binary protocol toggle with category filter chips: Heartbeat ([heartbeat], [capacity]), Work Steal ([work-request], [work-offer]), Escalation ([escalation], [health_alert]), Metrics ([dora-report], [pattern-resolved]), Scheduler ([work-inventory], [schedule-assignment], [scheduler-heartbeat], [schedule-conflict], [project-progress]). Add a helper function getProtocolCategory(content: string) that maps the opening bracket tag to one of these categories. Filter chip UI: small pill buttons below the search bar, each toggleable. When a chip is deselected, messages of that category are hidden. The existing showProtocol toggle becomes 'Show All Protocol' which selects all chips at once. Store selected categories in local component state (no store change needed).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/chat-overlay/ava-channel-tab.tsx`

### Verification
- [ ] Five category chips appear when showProtocol is enabled: Heartbeat, Work Steal, Escalation, Metrics, Scheduler
- [ ] Toggling a chip hides/shows messages of that category
- [ ] 'Show All Protocol' enables all chips at once
- [ ] Text search still works alongside category filtering
- [ ] Human messages (non-protocol) are never hidden by category filters
- [ ] Build passes with no TypeScript errors

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
