# Phase 2: Extract shared git exec environment and extractTitleFromDescription

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create libs/git-utils/src/exec-env.ts with createGitExecEnv() and extractTitleFromDescription(). Replace 5 PATH setup copies (git-workflow-service, worktree-recovery-service, github-merge-service, merge-eligibility-service, coderabbit-resolver-service) and 3 extractTitleFromDescription copies (git-workflow-service, auto-mode-service, execution-service).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/git-utils/src/exec-env.ts`
- [ ] `libs/git-utils/src/index.ts`
- [ ] `apps/server/src/services/git-workflow-service.ts`
- [ ] `apps/server/src/services/worktree-recovery-service.ts`
- [ ] `apps/server/src/services/github-merge-service.ts`
- [ ] `apps/server/src/services/merge-eligibility-service.ts`
- [ ] `apps/server/src/services/coderabbit-resolver-service.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`
- [ ] `apps/server/src/services/auto-mode/execution-service.ts`

### Verification
- [ ] Single createGitExecEnv() and extractTitleFromDescription()
- [ ] All copies replaced
- [ ] npm run build:packages passes
- [ ] npm run test:server passes

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
