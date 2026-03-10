# Phase 1: Add PR size check to git-workflow-service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Before creating a PR in git-workflow-service.ts runPostCompletionWorkflow(), calculate lines changed and files touched. Add `maxPRLinesChanged` (default: 500) and `maxPRFilesTouched` (default: 20) to WorkflowSettings. If PR exceeds limits: log a warning, add a label 'oversized-pr' to the PR, and create an actionable item for human review. Do NOT block the PR — just flag it. Future iteration can add decomposition.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/git-workflow-service.ts`
- [ ] `libs/types/src/global-settings.ts`

### Verification
- [ ] PR size calculated before creation
- [ ] Oversized PRs flagged with label and actionable item
- [ ] Size limits configurable in WorkflowSettings
- [ ] npm run build:server passes
- [ ] npm run test:server passes

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
