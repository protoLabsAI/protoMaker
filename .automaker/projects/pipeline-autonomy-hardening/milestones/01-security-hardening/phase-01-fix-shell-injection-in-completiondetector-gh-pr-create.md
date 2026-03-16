# Phase 1: Fix shell injection in CompletionDetector gh pr create

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

CompletionDetector passes epic titles directly into shell command strings for gh pr create. A title containing backticks or $() executes arbitrary commands. Replace exec() with execFile() passing arguments as an array. Also fix the PR body escaping to handle backslashes.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/completion-detector-service.ts`
- [ ] `apps/server/tests/unit/services/completion-detector-service.test.ts`

### Verification

- [ ] gh pr create uses execFile with argument array, not exec with string interpolation
- [ ] Unit test verifies epic title with special characters is safely escaped
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
