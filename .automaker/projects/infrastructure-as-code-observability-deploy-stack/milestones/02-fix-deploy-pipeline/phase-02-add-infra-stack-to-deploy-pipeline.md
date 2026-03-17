# Phase 2: Add infra stack to deploy pipeline

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update deploy-staging.yml to manage infra compose stack alongside app. Add deploy-infra.yml for independent infra restarts.

---

## Tasks

### Files to Create/Modify
- [ ] `.github/workflows/deploy-staging.yml`
- [ ] `.github/workflows/deploy-infra.yml`

### Verification
- [ ] App deploy ensures infra stack is running
- [ ] deploy-infra.yml can independently restart infra
- [ ] Health checks verify all infra services post-deploy

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
