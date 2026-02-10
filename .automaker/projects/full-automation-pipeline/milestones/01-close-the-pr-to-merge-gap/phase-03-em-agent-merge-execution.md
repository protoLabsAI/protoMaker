# Phase 3: EM agent merge execution

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Wire EM agent's handlePRApproved flow to call githubMergeService.mergePR(). When EM agent detects a PR is approved and CI passes, execute the squash merge via gh CLI. Emit audit event for merge decision.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/authority-agents/em-agent.ts`

### Verification
- [ ] EM agent calls mergePR on approval
- [ ] Audit event emitted
- [ ] Feature transitions to done after merge

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
