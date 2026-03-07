# Phase 2: Project artifact aggregation endpoint + combined project summary

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. Write tests for GET /api/projects/:slug/summary that returns: { project metadata, featureCount by status, milestones with completion %, artifacts: { ceremonies, changelogs, escalations } (from artifact index), recentTimeline: last 20 events }. Implement using ProjectArtifactService and EventLedgerService. This is the single API the frontend project page will call. Test that all sections are present and correctly typed.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/projects/index.ts`
- [ ] `apps/server/tests/integration/routes/project-summary.test.ts`

### Verification
- [ ] GET /api/projects/:slug/summary returns unified project data including features, artifacts, and recent timeline
- [ ] Response is correctly typed with a ProjectSummary type in libs/types
- [ ] Integration tests cover the full response shape with mocked dependencies
- [ ] Build passes

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
