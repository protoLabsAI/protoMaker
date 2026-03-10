# Ceremony Engine + Paper Trail

*Part of: Ava Delegation Architecture*

PM owns ceremony cadence — standups, retros, status reports — and writes everything to the project timeline for audit trail.

**Status:** undefined
**Dependencies:** expand-pm-tools

## Phases

### 1. Project timeline update service

Create ProjectTimelineService that appends structured update entries to projects. Each entry has: type (standup|retro|status_report|decision|escalation|milestone_complete), content (markdown), author (pm|ava|operator|lead-engineer), timestamp, metadata. Store as append-only entries in project.json under a timeline array. Expose via API: POST /api/projects/:slug/timeline, GET /api/projects/:slug/timeline.

**Complexity:** medium

**Files:**
- libs/types/src/project.ts
- apps/server/src/services/project-timeline-service.ts
- apps/server/src/routes/projects/index.ts

**Acceptance Criteria:**
- [ ] TimelineEntry type defined with all entry types
- [ ] Service appends entries atomically to project data
- [ ] GET endpoint returns paginated timeline
- [ ] POST endpoint creates new entries
- [ ] Build passes, entries persist across restarts

### 2. Ceremony cadence and PM tools

Add ceremony tools to PM: run_standup (summarize recent progress, blockers, next steps), run_retro (analyze what worked/didn't, action items), post_status_update (write to timeline), post_decision (record architectural/strategic decision with rationale). Each tool writes to the timeline service. Add cadence config to project settings: standup frequency (default: daily), retro frequency (default: per-milestone). PM system prompt includes ceremony schedule awareness.

**Complexity:** medium

**Files:**
- apps/server/src/routes/project-pm/pm-tools.ts
- libs/types/src/project.ts
- apps/server/src/routes/project-pm/index.ts

**Acceptance Criteria:**
- [ ] run_standup tool generates and posts standup to timeline
- [ ] run_retro tool generates and posts retro to timeline
- [ ] post_status_update and post_decision tools work
- [ ] Cadence config exists in project settings
- [ ] PM prompt includes next ceremony due date
- [ ] Build passes

### 3. Timeline UI in project detail

Enhance existing ProjectTimeline component to render new structured timeline entries. Different card styles for standups (green), retros (blue), decisions (amber), escalations (red), milestone completions (purple). Each card shows author, timestamp, expandable content. Filter by entry type. Auto-refresh via React Query.

**Complexity:** medium

**Files:**
- apps/ui/src/components/views/projects/project-timeline.tsx
- apps/ui/src/components/views/projects-view/project-detail.tsx

**Acceptance Criteria:**
- [ ] Timeline renders all entry types with distinct visual styles
- [ ] Entries filterable by type
- [ ] Auto-refreshes on new entries
- [ ] Looks good on mobile
- [ ] Build passes
