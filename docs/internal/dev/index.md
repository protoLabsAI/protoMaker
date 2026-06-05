# Development

Extend protoLabs. Architecture, packages, code standards, and how to contribute.

## Architecture

- **[System Architecture](./system-architecture)** — Complete runtime architecture: state machine, rules, timing, concurrency
- **[Monorepo Architecture](./monorepo-architecture)** — Workspace layout and the package dependency chain
- **[Frontend Philosophy](./frontend-philosophy)** — Gold standard frontend decisions: tokens, components, theming, tooling
- **[UI Architecture](./ui-architecture)** — React frontend structure, routing, state management
- **[UI Standards](./ui-standards)** — Enforcement layers for UI consistency
- **[Design Philosophy](./design-philosophy)** — UI design direction (Linear, Vercel, shadcn/ui)
- **[Design System](./design-system)** — Theme tokens and color system
- **[Shared Packages](./shared-packages)** — Monorepo package architecture and dependency chain
- **[Tool Package](./tool-package)** — `@protolabsai/tools` registry and `defineSharedTool`
- **[Folder Pattern](./folder-pattern)** — Component/view folder conventions

## AI Agent Infrastructure

- **[Agent Sandbox](./agent-sandbox)** — Threat model, security layers, buildSafeEnv rationale, known limitations
- **[Flows](./flows)** — LangGraph state graph primitives, subgraphs, maintenance flow
- **[Observability](./observability-package)** — Langfuse tracing and cost tracking
- **[Langfuse Integration](../../integrations/langfuse)** — Tracing, scoring, cost tracking
- **[Add a Cursor Model](./add-new-cursor-model)** — Register a new Cursor CLI model
- **[Ava Chat System](./ava-chat-system)** — Ava chat UI + config surface

## Storage

- **[Notes Sync](./notes-sync)** — Notes workspace: disk-based storage model, read/write paths, and MCP tool reference

## Pipeline & Orchestration

- **[Lead Engineer Pipeline](./lead-engineer-pipeline)** — Detailed processor logic (INTAKE through DEPLOY)
- **[Idea to Production](../../concepts/pipeline)** — The canonical pipeline reference (public)
- **[Project Lifecycle](../../concepts/project-lifecycle)** — Board-driven project state machine (public)
- **[Project Orchestration](./project-orchestration)** — Deep-research → PRD → scaffold → features
- **[Event Ledger](./event-ledger)** — Append-only lifecycle event persistence and timeline API
- **[Issue Management](./issue-management)** — Automated failure-to-issue pipeline
- **[Metrics](./metrics)** — DORA + agentic metrics
- **[Integration Registry](./integration-registry)** — Built-in integration descriptors

## Git & Process

- **[Branch Strategy](./branch-strategy)** — Single-trunk `feature/* → main` flow
- **[Git Workflow](./git-workflow)** — Commit/push/PR conventions and the guarded chokepoint
- **[Recovery Runbooks](./recovery-runbooks)** — Blocked-feature recovery procedures
- **[Release](./release)** — Release process
- **[Versioning](./versioning)** — Changesets and the fixed package group
- **[Contribution Model](./contribution-model)** — Trust tiers and external contributions
- **[QA Engineer](./qa-engineer)** — Release verification and wiring checks

## Standards & Guides

- **[Feature Status System](../../concepts/feature-lifecycle)** — The canonical 5-status feature lifecycle (public)
- **[Feature Flags](../../guides/feature-flags)** — How to add and consume feature flags (public)
- **[Clean Code](./clean-code)** — Code quality standards and patterns
- **[Python Standards](./python-standards)** — Python conventions
- **[Testing Patterns](./testing-patterns)** — Test patterns and anti-patterns
- **[Creating MCP Tools](./creating-mcp-tools)** — Add a tool to the MCP server
- **[Environment Setup](./environment-setup)** — Local dev + production environment
- **[Operator Tooling](./operator-tooling)** — The `protomaker` CLI and plugin

## Docs & Tooling

- **[Docs Standard](./docs-standard)** — IA rules, content guidelines, maintenance procedures
- **[Documentation Design](./documentation-design)** — Diataxis framework and the two surfaces
- **[Documentation Philosophy](./documentation-philosophy)** — Why the docs are structured this way
- **[Docs Site](./docs-site)** — VitePress build and deploy
- **[Terminal](./terminal)** — Terminal feature documentation
- **[tmux](./tmux)** — Optional terminal multiplexer setup (personal tooling)
