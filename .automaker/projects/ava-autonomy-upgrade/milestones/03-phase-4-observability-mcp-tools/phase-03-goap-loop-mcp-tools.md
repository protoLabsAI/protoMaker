# Phase 3: GOAP loop MCP tools

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add 2 MCP tools: start_goap_loop (calls /api/goap/start), get_goap_status (calls /api/goap/status). GOAP is the autonomous planning brain. Tools enable starting and monitoring the loop. Routes exist, just need MCP wrappers. Lower priority until GOAP system stabilizes.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/src/index.ts`

### Verification
- [ ] start_goap_loop starts the GOAP planning loop
- [ ] get_goap_status returns loop state and recent actions
- [ ] Both tools work via MCP test

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
