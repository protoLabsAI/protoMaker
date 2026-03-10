# Phase 2: Ceremony cadence and PM tools

*Ava Delegation Architecture > Ceremony Engine + Paper Trail*

Add ceremony tools to PM: run_standup (summarize recent progress, blockers, next steps), run_retro (analyze what worked/didn't, action items), post_status_update (write to timeline), post_decision (record architectural/strategic decision with rationale). Each tool writes to the timeline service. Add cadence config to project settings: standup frequency (default: daily), retro frequency (default: per-milestone). PM system prompt includes ceremony schedule awareness.

**Complexity:** medium

## Files to Modify

- apps/server/src/routes/project-pm/pm-tools.ts
- libs/types/src/project.ts
- apps/server/src/routes/project-pm/index.ts

## Acceptance Criteria

- [ ] run_standup tool generates and posts standup to timeline
- [ ] run_retro tool generates and posts retro to timeline
- [ ] post_status_update and post_decision tools work
- [ ] Cadence config exists in project settings
- [ ] PM prompt includes next ceremony due date
- [ ] Build passes