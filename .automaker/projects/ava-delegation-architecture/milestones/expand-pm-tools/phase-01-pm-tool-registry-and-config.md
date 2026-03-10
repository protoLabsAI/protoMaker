# Phase 1: PM tool registry and config

*Ava Delegation Architecture > Expand PM Tool Surface*

Create pm-tools.ts module mirroring ava-tools.ts pattern but scoped to project features. Define PM tool groups config (pm-config.ts). Include: board read/write (filtered by projectSlug), agent control (start/stop/output for project features), PR workflow (check, resolve, merge), orchestration (deps, execution order), context files, Lead Engineer status/start/stop. Register all tools with the PM chat route.

**Complexity:** large

## Files to Modify

- apps/server/src/routes/project-pm/pm-tools.ts
- apps/server/src/routes/project-pm/pm-config.ts
- apps/server/src/routes/project-pm/index.ts

## Acceptance Criteria

- [ ] PM has ~35 tools registered
- [ ] All tools scoped to project (projectSlug filter on board queries)
- [ ] PM config has tool group toggles like ava-config
- [ ] Build passes, server starts without errors