# Project-Level Agent Extensions

Make agent roles extensible at the project level — discoverable from .automaker/agents/*.yml manifests, wired into execution (model selection + prompt injection), with auto-assignment match rules and a settings UI.

**Status:** completed
**Created:** 2026-03-13T18:25:10.033Z
**Updated:** 2026-03-16T18:46:44.322Z

## PRD

### Situation

protoLabs Studio has 8 hardcoded AgentRole values defined as a TypeScript union type in libs/types/src/agent-roles.ts. CLI personas (Matt, Kai, Sam, Jon) exist as .claude/commands/*.md files but are user-invoked only. The assignedRole field on features is wired to this union but isn't enforced during execution — getModelForFeature() in execution-service.ts looks at complexity and failure count, never at the assigned role. No mechanism exists to load a role-specific prompt or model override from a project-level manifest.

### Problem

1. AgentRole is a compile-time union — adding project-specific roles requires rebuilding the types package.
2. Auto-mode ignores assignedRole entirely during model selection and prompt construction.
3. No runtime agent manifest loading from .automaker/agents/.
4. Features can't be auto-assigned to specialized agents based on category/keyword/file patterns.
5. Model defaults are global — no per-project or per-role overrides in the execution path.

### Approach

M1 — Type Foundation: Change AgentRole from a union to string with BUILT_IN_AGENT_ROLES as a const array. Add ProjectAgent and AgentManifest types. Add agentConfig to per-project workflow settings.

M2 — Manifest Service: AgentManifestService discovers and parses .automaker/agents.yml + .automaker/agents/*.yml at project load. Exposes agents via API route. Caches per project with file-watch invalidation.

M3 — Execution Wiring: getModelForFeature() checks assigned role's manifest entry for model override. Agent system prompt loader checks for role-specific prompt file and prepends it. Match rules run before auto-mode pickup to auto-assign assignedRole.

M4 — Settings UI: Project settings Agents tab shows discovered project agents. Feature card exposes assignedRole selector with built-in + discovered options.

### Results

- assignedRole becomes meaningful in execution — drives model selection and prompt injection
- Project-level agents discoverable from .automaker/agents/*.yml manifests
- Auto-assignment via match rules (category, keywords, file patterns)
- Backward compatible — all existing features and built-in roles unchanged
- Foundation for RFC-001 Phase 2+ (quality gates, agent groups) without rework

### Constraints

No new npm dependencies,Zero breaking changes to existing feature JSON or settings,Must work with the existing 8 built-in roles unchanged,No quality gates or agent groups in this scope (deferred to future RFC phases),Manifest format: YAML with comments support,AgentRole type must remain assignable from plain strings for backward compat

## Milestones

### 1. Type Foundation

Make AgentRole extensible and define the agent manifest data model. This is the foundation — all other milestones depend on these types.

**Status:** completed

#### Phases

1. **Extensible AgentRole type + ProjectAgent manifest types** (medium)
2. **Per-project agent config in WorkflowSettings** (small)

### 2. Agent Manifest Service

Server-side service that discovers, parses, validates, and caches agent manifests from .automaker/agents/. Exposes via API for the UI.

**Status:** completed

#### Phases

1. **AgentManifestService — load, parse, validate, cache** (medium)
2. **API routes for agent manifest** (medium)

### 3. Execution Wiring

Wire the agent manifest into the actual execution path — model selection, prompt injection, and auto-assignment on feature pickup.

**Status:** completed

#### Phases

1. **Wire assignedRole into getModelForFeature()** (medium)
2. **Role prompt injection in agent system prompt** (medium)
3. **Match rule auto-assignment on feature pickup** (medium)

### 4. Settings UI

Frontend UI for viewing discovered agents and assigning roles to features.

**Status:** pending

#### Phases

1. **Agents panel in project settings + feature role selector** (medium)
