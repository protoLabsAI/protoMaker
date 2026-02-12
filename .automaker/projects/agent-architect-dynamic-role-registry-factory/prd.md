# PRD: Agent Architect: Dynamic Role Registry & Factory

## Situation
Automaker has 8 static AgentRole types and 5 AuthorityRole types hardcoded as TypeScript union types. Adding a new role requires modifying 11+ files across types, prompts, services, and UI. The process is documented in docs/dev/adding-team-members.md but remains a 7-step manual procedure. There is no way to create roles at runtime, and the Agent Architect concept — an agent that manages other agents — cannot exist without dynamic role registration.

## Problem
Three problems block agent autonomy: (1) Static role definitions prevent runtime agent creation — every new role requires code changes, rebuild, and restart. (2) No unified role registry — three parallel systems (AgentRole, AuthorityRole, AgentRoleName) with no mapping between them create confusion and inconsistency. (3) No RBAC enforcement at the tool level — agents get all-or-nothing tool access with no per-invocation policy checks. Without these, Ava cannot create specialized agents on-the-fly, and the vision of an autonomous AI development studio stalls.

## Approach
Phased migration from static to dynamic roles: (1) Create AgentTemplateSchema with Zod validation for runtime type safety. (2) Build AgentFactoryService as a template registry with JSON-based role definitions. (3) Implement DynamicAgent executor that creates agent instances from templates. (4) Add tier-based RBAC — Tier 0 roles (Ava, PM, EM) are protected/immutable, Tier 1 roles are manageable via CRUD tools. (5) Expose 7 MCP tools for agent management. (6) Gradual consumer migration — switch statements and Record<AgentRole,T> patterns converted to registry lookups with fallbacks. Built-in roles remain as JSON templates, custom roles stored in .automaker/agents/.

## Results
After completion: (1) New agent roles can be created at runtime via MCP tools or JSON templates — no code changes needed. (2) Ava can spawn specialized agents dynamically based on project needs. (3) Role capabilities, tools, and prompts are validated via Zod schemas. (4) Tier system prevents modification of leadership roles while enabling full CRUD on worker roles. (5) All existing functionality preserved — built-in roles work identically, just loaded from templates instead of hardcoded.

## Constraints
Must be 100% backward compatible — existing static roles must work identically throughout migration,Tier 0 roles (Ava, PM, EM, GTM, orchestrators) cannot be modified or deleted via CRUD tools,No changes to AuthorityRole system in this project — focus on AgentRole/headsdown roles only,Prompt function signatures must remain individually typed — use adapter pattern, not forced unification,Template JSON files must be human-readable and version-controllable,Each phase must be independently testable and deployable
