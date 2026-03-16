# Phase 2: Register all handlers and delete switch statement

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Migrate all 153 case handlers to registry registrations grouped by domain. Replace switch with registry.handle()

---

## Tasks

### Files to Create/Modify

- [ ] `packages/mcp-server/src/handlers/`
- [ ] `packages/mcp-server/src/index.ts`

### Verification

- [ ] Switch statement replaced
- [ ] index.ts under 200 lines

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
