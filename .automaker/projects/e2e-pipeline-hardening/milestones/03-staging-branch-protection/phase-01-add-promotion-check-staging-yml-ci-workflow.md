# Phase 1: Add promotion-check-staging.yml CI workflow

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create .github/workflows/promotion-check-staging.yml that runs on pull_request events targeting the staging branch. Allow head branches matching dev or promote/*. Reject all others with a descriptive error explaining the required promotion flow. Model on existing promotion-check.yml. Update docs/dev/branch-strategy.md to document this enforcement.

---

## Tasks

### Files to Create/Modify
- [ ] `.github/workflows/promotion-check-staging.yml`
- [ ] `docs/dev/branch-strategy.md`

### Verification
- [ ] Workflow file exists and runs on pull_request targeting staging
- [ ] PRs from dev branch are allowed
- [ ] PRs from promote/* branches are allowed
- [ ] PRs from any other branch fail with clear error
- [ ] docs/dev/branch-strategy.md updated
- [ ] Build passes

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
