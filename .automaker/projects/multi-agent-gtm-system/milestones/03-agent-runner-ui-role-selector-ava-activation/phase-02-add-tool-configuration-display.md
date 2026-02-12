# Phase 2: Add tool configuration display

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Show which tools are available for the selected role in the agent config popover. Display as a read-only chip list (from ROLE_CAPABILITIES.tools). In future this becomes editable for the agent builder.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-view/components/agent-config-popover.tsx`

### Verification
- [ ] Tool chips visible when role selected
- [ ] Tools match ROLE_CAPABILITIES for selected role
- [ ] Visual distinction between tool types (read, write, execute)

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
