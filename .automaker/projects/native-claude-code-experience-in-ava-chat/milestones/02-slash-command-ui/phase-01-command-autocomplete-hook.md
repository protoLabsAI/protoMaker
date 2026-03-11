# Phase 1: Command Autocomplete Hook

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create useSlashCommands hook that: fetches command list from GET /api/chat/commands on mount (with SWR/stale-while-revalidate), tracks whether the current input starts with / and extracts the query string, filters commands by query match (name + description), exposes filtered list + active state + keyboard selection index. This is the data layer for the autocomplete UI.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/hooks/use-slash-commands.ts`
- [ ] `apps/ui/src/lib/clients/ava-client.ts`

### Verification
- [ ] Hook fetches commands on mount
- [ ] Detects / prefix in input and activates autocomplete mode
- [ ] Filters commands by name and description substring match
- [ ] Exposes: commands, isActive, query, selectedIndex, select()
- [ ] Deactivates when / is removed or space follows a non-matching prefix

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
