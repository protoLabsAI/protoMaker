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

- [x] `apps/ui/src/components/views/chat-overlay/ava-channel-tab.tsx`

### Verification

- [x] Five category chips appear when showProtocol is enabled: Heartbeat, Work Steal, Escalation, Metrics, Scheduler
- [x] Toggling a chip hides/shows messages of that category
- [x] 'Show All Protocol' enables all chips at once
- [x] Text search still works alongside category filtering
- [x] Human messages (non-protocol) are never hidden by category filters
- [x] Build passes with no TypeScript errors

---

## Deliverables

- [x] Code implemented and working
- [x] Tests passing
- [x] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [x] All tasks complete
- [x] Tests passing
- [x] Code reviewed
- [x] PR merged to main — [PR#2045](https://github.com/protoLabsAI/protoMaker/pull/2045)
- [x] Team notified

**Next**: Phase 2
