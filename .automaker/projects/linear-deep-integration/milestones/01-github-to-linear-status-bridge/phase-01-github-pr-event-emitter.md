# Phase 1: GitHub PR event emitter

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Enhance GitHubStateChecker to emit typed events on PR state changes. Track last-known PR state per feature to avoid duplicates. Events: github:pr:review-submitted, github:pr:checks-updated, github:pr:approved, github:pr:changes-requested

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/github-state-checker.ts`
- [ ] `libs/types/src/events.ts`

### Verification
- [ ] GitHubStateChecker emits events on state changes
- [ ] Last-known state tracked per feature to prevent duplicate events
- [ ] Events include PR number, branch, review state, CI status

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
