# Phase 2: GitHub to Linear bridge service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

New GitHubLinearBridgeService that subscribes to GitHub PR events and pushes comments/updates to Linear issues. On changes-requested: add comment with reviewer+feedback. On checks-failed: comment with failed checks. On approved: comment noting approval.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/github-linear-bridge-service.ts`
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] Service subscribes to github:pr:* events
- [ ] Posts formatted comments to corresponding Linear issues
- [ ] Includes reviewer name, check names, and actionable details
- [ ] Graceful skip when feature has no linearIssueId

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
