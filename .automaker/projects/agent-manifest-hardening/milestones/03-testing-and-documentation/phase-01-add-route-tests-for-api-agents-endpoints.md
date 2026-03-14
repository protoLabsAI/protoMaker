# Phase 1: Add route tests for /api/agents endpoints

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add integration-style tests for the three agent API endpoints: list, get, and match. Test input validation, built-in role handling, manifest merging, and error cases.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/routes/agents.test.ts`

### Verification
- [ ] Tests cover list, get, and match endpoints
- [ ] Tests verify built-in role fallback in get
- [ ] Tests verify input validation (missing projectPath, agentName)
- [ ] All tests pass

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
