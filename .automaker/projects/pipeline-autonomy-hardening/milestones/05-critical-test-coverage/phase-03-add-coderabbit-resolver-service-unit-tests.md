# Phase 3: Add coderabbit-resolver-service unit tests

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

coderabbit-resolver-service.ts is 471 lines with zero tests. Cover: review thread parsing, resolution, reply-and-resolve, owner/repo extraction from URL formats, error handling.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/tests/unit/services/coderabbit-resolver-service.test.ts`

### Verification

- [ ] Tests cover thread parsing with mock GraphQL responses
- [ ] Tests cover owner/repo extraction from HTTPS and SSH URLs
- [ ] Tests cover graceful GraphQL error handling
- [ ] At least 10 test cases
- [ ] npm run test:server passes

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
