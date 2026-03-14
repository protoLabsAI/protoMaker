# Development

Extend protoLabs. Architecture, packages, code standards, and how to contribute.

## Architecture

- **[Frontend Philosophy](./frontend-philosophy)** — Gold standard frontend decisions: tokens, components, theming, tooling
- **[UI Architecture](./ui-architecture)** — React frontend structure, routing, state management
- **[Shared Packages](./shared-packages)** — Monorepo package architecture and dependency chain
- **[Feature Status System](./feature-status-system)** — The 5-status feature lifecycle

## AI Agent Infrastructure

- **[Flows](./flows)** — LangGraph state graph primitives, coordinator pattern, Send() fan-out
- **[Observability](./observability-package)** — Langfuse tracing and cost tracking
- **[Langfuse Integration](../integrations/langfuse)** — Tracing, scoring, cost tracking

## Distributed Systems

- **[Distributed Sync](./distributed-sync)** — Peer mesh architecture, partition detection, leader election, and pull-based work intake protocol
- **[Notes Sync](./notes-sync)** — Notes workspace: disk-based storage model, read/write paths, and MCP tool reference

## Pipeline & Orchestration

- **[Idea to Production](./idea-to-production)** — The canonical 9-phase pipeline reference
- **[Project Lifecycle](./project-lifecycle)** — Board-driven project state machine
- **[Event Ledger](./event-ledger)** — Append-only lifecycle event persistence and timeline API
- **[PR Remediation Loop](./pr-remediation-loop)** — Autonomous PR review feedback handling
- **[Issue Management](./issue-management)** — Automated failure-to-issue pipeline

## Guides

- **[Feature Flags](./feature-flags)** — How to add and consume feature flags; single source of truth; FeatureFlags vs WorkflowSettings
- **[Clean Code](./clean-code)** — Code quality standards and patterns
- **[Testing Patterns](./testing-patterns)** — Test patterns and anti-patterns
- **[Design Philosophy](./design-philosophy)** — UI design direction (Linear, Vercel, shadcn/ui)
- **[tmux](./tmux)** — Terminal multiplexer setup, config, and key bindings reference

## Processes

- **[Release](./release)** — Release process and Electron builds
- **[Terminal](./terminal)** — Terminal feature documentation
- **[Docs Standard](./docs-standard)** — IA rules, content guidelines, maintenance procedures
