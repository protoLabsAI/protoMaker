# Phase 3: Backfill projectSlug on existing features

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write a one-time migration that scans all features, identifies their project association (by epicId chain, milestoneSlug, or project membership), and sets projectSlug. Expose as a POST /api/features/backfill-project-slug endpoint for admin use.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/features/routes/backfill-project-slug.ts`
- [ ] `apps/server/src/server/routes.ts`

### Verification
- [ ] Backfill correctly identifies project for features with epicId or milestoneSlug
- [ ] Idempotent - safe to run multiple times
- [ ] Reports count of features updated
- [ ] Does not overwrite existing projectSlug values

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
