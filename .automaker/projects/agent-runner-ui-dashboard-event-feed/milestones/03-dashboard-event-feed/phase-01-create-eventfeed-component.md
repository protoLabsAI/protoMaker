# Phase 1: Create EventFeed component

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a reusable EventFeed component that subscribes to the WebSocket event stream at /api/events and displays recent events in a reverse-chronological list. Each event shows: timestamp, icon (color-coded by type), description. Event types to surface: feature:started, feature:completed, feature:error, feature:retry, auto-mode:started/stopped/idle, feature:pr-merged, feature:committed, health:issue-detected, health:issue-remediated, milestone:completed, project:completed. Max 25 events, auto-scrolls. Use existing WebSocket infrastructure from useElectronAgent pattern.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/dashboard-view/event-feed.tsx`
- [ ] `apps/ui/src/hooks/use-event-feed.ts`

### Verification
- [ ] Component connects to WebSocket event stream
- [ ] Shows last 25 events reverse-chronologically
- [ ] Events are color-coded by type (green=success, red=error, blue=info, yellow=warning)
- [ ] Auto-scrolls on new events
- [ ] Disconnection state handled gracefully

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
