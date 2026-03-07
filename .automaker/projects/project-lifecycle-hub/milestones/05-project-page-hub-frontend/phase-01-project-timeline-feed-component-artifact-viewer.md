# Phase 1: Project timeline feed component + artifact viewer

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase (Vitest component tests). Build a ProjectTimeline React component that fetches from /api/projects/:slug/timeline and renders a chronological activity feed. Events should be typed and rendered with icons: feature:done (check), milestone:completed (flag), ceremony:fired (celebration), escalation (warning), pr:merged (merge). Build a ProjectArtifactViewer component that renders ceremony reports and changelogs from the artifact list. Use existing atom/molecule components. Write Vitest unit tests for event rendering logic. Wire both into the existing project detail page route.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/projects/project-timeline.tsx`
- [ ] `apps/ui/src/components/views/projects/project-artifact-viewer.tsx`
- [ ] `apps/ui/src/routes/projects/$projectSlug.tsx`
- [ ] `apps/ui/src/hooks/use-project-summary.ts`
- [ ] `apps/ui/tests/unit/project-timeline.test.tsx`

### Verification
- [ ] ProjectTimeline renders activity feed from /api/projects/:slug/timeline
- [ ] Each event type has a distinct icon and label
- [ ] ProjectArtifactViewer renders ceremony reports and changelogs from artifact list
- [ ] useProjectSummary hook fetches /api/projects/:slug/summary
- [ ] Vitest unit tests cover event rendering and empty states
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
