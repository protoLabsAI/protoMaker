# Phase 1: Outbound dependency to relation sync

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When features have dependencies set, create Linear blocks relations via GraphQL. New method in LinearMCPClient: createIssueRelation(). Hook into set_feature_dependencies and project:scaffolded events.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/linear-mcp-client.ts`
- [ ] `apps/server/src/services/linear-sync-service.ts`

### Verification
- [ ] LinearMCPClient.createIssueRelation() works
- [ ] Dependencies synced on feature creation
- [ ] Duplicate relations detected and skipped

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
