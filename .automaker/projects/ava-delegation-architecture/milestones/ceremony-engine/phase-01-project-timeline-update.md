# Phase 1: Project timeline update service

*Ava Delegation Architecture > Ceremony Engine + Paper Trail*

Create ProjectTimelineService that appends structured update entries to projects. Each entry has: type (standup|retro|status_report|decision|escalation|milestone_complete), content (markdown), author (pm|ava|operator|lead-engineer), timestamp, metadata. Store as append-only entries in project.json under a timeline array. Expose via API: POST /api/projects/:slug/timeline, GET /api/projects/:slug/timeline.

**Complexity:** medium

## Files to Modify

- libs/types/src/project.ts
- apps/server/src/services/project-timeline-service.ts
- apps/server/src/routes/projects/index.ts

## Acceptance Criteria

- [ ] TimelineEntry type defined with all entry types
- [ ] Service appends entries atomically to project data
- [ ] GET endpoint returns paginated timeline
- [ ] POST endpoint creates new entries
- [ ] Build passes, entries persist across restarts