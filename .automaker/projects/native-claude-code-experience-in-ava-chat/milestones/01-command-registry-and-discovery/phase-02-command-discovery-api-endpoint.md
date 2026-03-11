# Phase 2: Command Discovery API Endpoint

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create GET /api/chat/commands endpoint that returns the command registry as a typed array. Each entry includes: name, description, argumentHint, source (builtin/plugin/skill/project). Endpoint used by the ChatInput autocomplete dropdown.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/chat/index.ts`
- [ ] `libs/types/src/chat.ts`

### Verification
- [ ] GET /api/chat/commands returns array of SlashCommand objects
- [ ] Each command has name, description, argumentHint, source fields
- [ ] Types exported from @protolabsai/types
- [ ] Endpoint tested with curl

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
