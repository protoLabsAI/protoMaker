# Phase 2: Update ContentFlowService and MCP tools for autonomous mode

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update the server-side ContentFlowService and MCP command handlers to support the new autonomous flow. Remove mandatory HITL interaction from create-content and review-content tools. Add new status values for antagonistic review passes.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/content-flow-service.ts`
- [ ] `apps/server/src/routes/content/index.ts`

### Verification
- [ ] create-content runs to completion autonomously by default
- [ ] review-content still works for optional human override
- [ ] get-content-status shows antagonistic review progress
- [ ] New status values: reviewing_research, reviewing_outline, reviewing_content

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
