# Phase 3: PM system prompt with project context

*Ava Delegation Architecture > Expand PM Tool Surface*

Build rich PM system prompt including: project PRD summary, current milestone/phase status, recent timeline entries, active features + statuses, Lead Engineer state, ceremony schedule. Load from project files + live API data. Create pm-prompt.md template.

**Complexity:** medium

## Files to Modify

- apps/server/src/routes/project-pm/pm-prompt.md
- apps/server/src/routes/project-pm/index.ts

## Acceptance Criteria

- [ ] PM system prompt includes project PRD, milestones, features, Lead state
- [ ] Context loaded dynamically per request
- [ ] Prompt stays under 4k tokens even for large projects
- [ ] Build passes