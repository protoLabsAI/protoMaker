# Phase 1: Convert bottom-panel ticker to hover popover with network stats

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In bottom-panel.tsx, replace the DropdownMenu with a HoverCard (openDelay=300ms). Trigger stays the same status indicator. Popover content: connection status badge, instance name and role, peer count (X online / Y total), compact peer list with capacity bars. Remove server URL switching items (recent connections, reset to default, peer URL jump) from this component.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/layout/bottom-panel/bottom-panel.tsx`

### Verification
- [ ] Ticker stats shown on hover not click
- [ ] Popover shows connection status, instance name/role, peer list with capacity
- [ ] No server URL switching in ticker
- [ ] HoverCard opens after 300ms, closes on mouse leave
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
