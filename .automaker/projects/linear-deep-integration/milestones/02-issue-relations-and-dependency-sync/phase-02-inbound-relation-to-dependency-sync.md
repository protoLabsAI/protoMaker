# Phase 2: Inbound relation to dependency sync

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When Linear issue relations change via webhook, update Automaker feature dependencies. Poll issueRelations on issue update webhook.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/linear-sync-service.ts`
- [ ] `apps/server/src/routes/linear/webhook.ts`

### Verification
- [ ] Issue update webhook checks for relation changes
- [ ] New relations mapped to Automaker dependencies
- [ ] Loop prevention for bidirectional sync

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
