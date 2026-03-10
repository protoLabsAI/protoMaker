# Expand PM Tool Surface

*Part of: Ava Delegation Architecture*

Give the PM agent real power — board ops, agent control, PR workflow, dependencies, Lead Engineer query/control. Upgrade from Haiku to Sonnet.

**Status:** undefined

## Phases

### 1. PM tool registry and config

Create pm-tools.ts module mirroring ava-tools.ts pattern but scoped to project features. Define PM tool groups config (pm-config.ts). Include: board read/write (filtered by projectSlug), agent control (start/stop/output for project features), PR workflow (check, resolve, merge), orchestration (deps, execution order), context files, Lead Engineer status/start/stop. Register all tools with the PM chat route.

**Complexity:** large

**Files:**
- apps/server/src/routes/project-pm/pm-tools.ts
- apps/server/src/routes/project-pm/pm-config.ts
- apps/server/src/routes/project-pm/index.ts

**Acceptance Criteria:**
- [ ] PM has ~35 tools registered
- [ ] All tools scoped to project (projectSlug filter on board queries)
- [ ] PM config has tool group toggles like ava-config
- [ ] Build passes, server starts without errors

### 2. PM model upgrade to Sonnet

Change PM chat route to use Sonnet by default instead of Haiku. Update transport config, system prompt to leverage Sonnet capabilities. Add extended thinking support for PM. Ensure model alias flows through from client header.

**Complexity:** small

**Files:**
- apps/server/src/routes/project-pm/index.ts
- apps/ui/src/hooks/use-pm-chat-session.ts

**Acceptance Criteria:**
- [ ] PM uses Sonnet by default
- [ ] x-model-alias header respected for PM chat
- [ ] Extended thinking enabled for PM on Sonnet/Opus
- [ ] Build passes

### 3. PM system prompt with project context

Build rich PM system prompt including: project PRD summary, current milestone/phase status, recent timeline entries, active features + statuses, Lead Engineer state, ceremony schedule. Load from project files + live API data. Create pm-prompt.md template.

**Complexity:** medium

**Files:**
- apps/server/src/routes/project-pm/pm-prompt.md
- apps/server/src/routes/project-pm/index.ts

**Acceptance Criteria:**
- [ ] PM system prompt includes project PRD, milestones, features, Lead state
- [ ] Context loaded dynamically per request
- [ ] Prompt stays under 4k tokens even for large projects
- [ ] Build passes
