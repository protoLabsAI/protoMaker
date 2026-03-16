# Phase 2: Fix GraphQL injection in CodeRabbitResolver and git-workflow-service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

CodeRabbitResolver and git-workflow-service build GraphQL queries via string interpolation with owner/repoName from git remote parsing. Use execFile or stdin piping for gh api graphql calls. Also deduplicate the owner/repo parsing into a private helper. Fix backslash escaping in reply body.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/coderabbit-resolver-service.ts`
- [ ] `apps/server/src/services/git-workflow-service.ts`

### Verification

- [ ] All gh api graphql calls use execFile with argument arrays
- [ ] Owner/repo parsing deduplicated into helper method
- [ ] npm run typecheck passes

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
