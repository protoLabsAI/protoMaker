# protoLabs Studio Documentation

## Getting Started

| Document                                                               | Description                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| [Overview](./getting-started/index.md)                                 | What is protoLabs, quick tutorial, key concepts |
| [Installation](./getting-started/installation.md)                      | Install the desktop app                         |
| [Installation (Fedora/RHEL)](./getting-started/installation-fedora.md) | Install on Fedora/RHEL Linux                    |

## Agent System

| Document                                                 | Description                                               |
| -------------------------------------------------------- | --------------------------------------------------------- |
| [Agent Philosophy](./agents/philosophy.md)               | Why named personas, model tiers, worktree isolation       |
| [Architecture Overview](./agents/architecture.md)        | Agent types, execution model, architecture layers         |
| [Agent Flows](./agents/agent-flows.md)                   | LangGraph agent execution flows and patterns              |
| [SDK Integration](./agents/sdk-integration.md)           | Claude Agent SDK integration and usage                    |
| [Context System](./agents/context-system.md)             | Context loading, memory files, smart selection            |
| [Memory System](./agents/memory-system.md)               | Agent memory, knowledge hive integration                  |
| [Prompt Engineering](./agents/prompt-engineering.md)     | Prompt composition, registry, writing effective prompts   |
| [Prompt Techniques](./agents/prompt-techniques.md)       | Concrete techniques for reliable agent outputs            |
| [Authoring Prompts](./agents/authoring-prompts.md)       | How to write agent system prompts                         |
| [Authoring Skills](./agents/authoring-skills.md)         | How to create skills for the plugin                       |
| [Reliability & Recovery](./agents/reliability.md)        | Failure handling, escalation, health sweeps               |
| [Escalation Routing](./agents/escalation-routing.md)     | Escalation channels, dedup, rate limiting, acknowledgment |
| [Agile Ceremonies](./agents/ceremonies.md)               | Automated standups, retros, project retrospectives        |
| [Creating Agent Teams](./agents/creating-agent-teams.md) | Multi-agent coordination and event-driven systems         |
| [Adding Teammates](./agents/adding-teammates.md)         | How to create new authority agents (PM, EM, etc.)         |
| [Adding Team Members](./agents/adding-team-members.md)   | Dynamic and static approaches to adding agents            |
| [MCP Integration](./agents/mcp-integration.md)           | How MCP tools interact with agents                        |

## Infrastructure

| Document                                          | Description                                      |
| ------------------------------------------------- | ------------------------------------------------ |
| [Architecture](./infra/architecture.md)           | System diagrams, multi-instance topology         |
| [Docker](./infra/docker.md)                       | Dockerfile architecture, multi-stage builds      |
| [Docker Compose](./infra/docker-compose.md)       | Compose variants, volumes, environment           |
| [Deployment](./infra/deployment.md)               | Deployment options (local, Docker, systemd)      |
| [High-Concurrency](./infra/staging-deployment.md) | High-concurrency deployment for many agents      |
| [Orchestration](./infra/orchestration.md)         | Multi-instance orchestration and coordination    |
| [Secrets](./infra/secrets.md)                     | Infisical setup, MCP secret injection            |
| [Networking](./infra/networking.md)               | Ports, nginx, CORS, WebSocket, reverse proxy     |
| [Security](./infra/security.md)                   | Container security, credential management        |
| [CI/CD](./infra/ci-cd.md)                         | GitHub Actions workflows                         |
| [Runners](./infra/runners.md)                     | Self-hosted runner setup, memory limits, cleanup |
| [Monitoring](./infra/monitoring.md)               | Health checks, logging, observability            |
| [Observability](./infra/observability.md)         | Infrastructure observability and metrics         |
| [Backup & Recovery](./infra/backup-recovery.md)   | Volume backups, restore procedures               |
| [systemd](./infra/systemd.md)                     | systemd service configuration                    |
| [Troubleshooting](./infra/troubleshooting.md)     | Common issues and solutions                      |

## Integrations

| Document                                                     | Description                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| [Browser Extension](./integrations/browser-extension.md)     | Chrome extension for side panel chat, context menu, and GitHub |
| [Claude Plugin](./integrations/claude-plugin.md)             | Plugin installation, configuration, Docker deployment          |
| [Plugin Quickstart](./integrations/plugin-quickstart.md)     | 5-minute happy-path setup guide                                |
| [Plugin Deep Dive](./integrations/plugin-deep-dive.md)       | Architecture, hooks, tools, and extension points               |
| [Plugin Commands](./integrations/plugin-commands.md)         | Commands reference, subagents, step-by-step examples           |
| [MCP Tools Reference](./integrations/mcp-tools-reference.md) | Full MCP tool catalog (120+ tools)                             |
| [Discord](./integrations/discord.md)                         | Discord channels, bot integration, event routing               |
| [GitHub](./integrations/github.md)                           | GitHub integration, PR workflows, webhooks                     |
| [Langfuse](./integrations/langfuse.md)                       | Tracing, cost tracking, scoring, MCP tools                     |
| [API Key Profiles](./integrations/api-key-profiles.md)       | Unified API key and provider profile system                    |

## Server Reference

| Document                                               | Description                                      |
| ------------------------------------------------------ | ------------------------------------------------ |
| [Actionable Items](./server/actionable-items.md)       | HITL forms, inbox, notifications, browser alerts |
| [Automation Registry](./server/automation-registry.md) | Automated workflow triggers and handlers         |
| [Ava Chat](./server/ava-chat.md)                       | Ava chat API, session management, tool system    |
| [Calendar API](./server/calendar-api.md)               | Calendar event management endpoints              |
| [Knowledge Store](./server/knowledge-store.md)         | SQLite FTS5 knowledge base for agent context     |
| [Knowledge Hive](./server/knowledge-hive.md)           | Multi-source knowledge aggregation and retrieval |
| [Model Resolver](./server/model-resolver.md)           | Model alias resolution and tier selection        |
| [Providers](./server/providers.md)                     | AI provider architecture (Claude, Cursor, Codex) |
| [Quarantine Pipeline](./server/quarantine-pipeline.md) | Code quarantine, trust tiers, and approval flow  |
| [RAG Techniques](./server/rag-techniques.md)           | Retrieval-augmented generation implementation    |
| [Route Organization](./server/route-organization.md)   | Express route structure and patterns             |
| [Utilities](./server/utilities.md)                     | Server utility functions reference               |

## Authority System

| Document                              | Description                                      |
| ------------------------------------- | ------------------------------------------------ |
| [Org Chart](./authority/org-chart.md) | Trust hierarchy, role permissions, policy checks |
| [Team Roles](./authority/roles.md)    | Agent roles and responsibilities (canonical)     |

## Development

| Document                                                | Description                                        |
| ------------------------------------------------------- | -------------------------------------------------- |
| [Overview](./dev/index.md)                              | Development guide overview                         |
| [Environment Setup](./dev/environment-setup.md)         | Dev environment prerequisites and setup            |
| [Branch Strategy](./dev/branch-strategy.md)             | Three-branch flow (dev, staging, main)             |
| [Git Workflow](./dev/git-workflow.md)                   | Git conventions, PR process, worktrees             |
| [Idea to Production](./dev/idea-to-production.md)       | The canonical 8-phase pipeline reference           |
| [Inbox System](./dev/inbox-system.md)                   | Unified actionable items inbox                     |
| [Project Lifecycle](./dev/project-lifecycle.md)         | Project state machine                              |
| [PR Remediation Loop](./dev/pr-remediation-loop.md)     | Autonomous PR review feedback handling             |
| [Feature Status System](./dev/feature-status-system.md) | 5-status feature lifecycle                         |
| [Feature Flags](./dev/feature-flags.md)                 | Feature flag system and conventions                |
| [Issue Management](./dev/issue-management.md)           | Automated failure-to-issue pipeline                |
| [Shared Packages](./dev/shared-packages.md)             | Monorepo package architecture                      |
| [Monorepo Architecture](./dev/monorepo-architecture.md) | Workspace structure and dependency chain           |
| [Flows Package](./dev/flows.md)                         | LangGraph state graph primitives and patterns      |
| [Tool Package](./dev/tool-package.md)                   | Unified tool definition and registry               |
| [Observability Package](./dev/observability-package.md) | Langfuse tracing and cost tracking                 |
| [Integration Registry](./dev/integration-registry.md)   | Service integration registry patterns              |
| [Creating MCP Tools](./dev/creating-mcp-tools.md)       | How to add new MCP tools                           |
| [Design Philosophy](./dev/design-philosophy.md)         | UI design direction (Linear, Vercel, shadcn/ui)    |
| [Design System](./dev/design-system.md)                 | Design tokens, theming, component patterns         |
| [Frontend Philosophy](./dev/frontend-philosophy.md)     | Gold standard frontend decisions                   |
| [UI Architecture](./dev/ui-architecture.md)             | Frontend structure and patterns                    |
| [UI Standards](./dev/ui-standards.md)                   | Component library, forbidden patterns, enforcement |
| [Ava Chat System](./dev/ava-chat-system.md)             | Chat UI architecture, components, tool cards       |
| [Notes Panel](./dev/notes-panel.md)                     | Notes panel feature documentation                  |
| [Folder Pattern](./dev/folder-pattern.md)               | Directory organization conventions                 |
| [Instance State](./dev/instance-state.md)               | Server instance state management                   |
| [Contribution Model](./dev/contribution-model.md)       | How to contribute to protoLabs                     |
| [Testing Patterns](./dev/testing-patterns.md)           | Test patterns and anti-patterns                    |
| [Desktop Testing](./dev/desktop-testing.md)             | Electron desktop app testing                       |
| [Clean Code](./dev/clean-code.md)                       | Code quality standards and patterns                |
| [Versioning](./dev/versioning.md)                       | Version numbering and release tagging              |
| [Release](./dev/release.md)                             | Release process and Electron builds                |
| [Terminal](./dev/terminal.md)                           | Terminal feature documentation                     |
| [tmux](./dev/tmux.md)                                   | Terminal multiplexer setup and keybindings         |
| [Add New Cursor Model](./dev/add-new-cursor-model.md)   | How to add a new Cursor model                      |
| [Gotchas](./dev/gotchas.md)                             | Known pitfalls and workarounds                     |
| [Docs Standard](./dev/docs-standard.md)                 | IA rules, content guidelines, maintenance          |
| [Docs Site](./dev/docs-site.md)                         | VitePress setup, deployment, and config            |

## protoLabs

| Document                                                            | Description                                         |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| [Overview](./protolabs/index.md)                                    | protoLabs methodology and guides                    |
| [Agency Overview](./protolabs/agency-overview.md)                   | How the full-loop automation system works           |
| [Agency Architecture](./protolabs/agency-architecture.md)           | System architecture, component inventory, data flow |
| [Brand](./protolabs/brand.md)                                       | Brand bible, voice, naming, identity                |
| [Setup Pipeline](./protolabs/setup-pipeline.md)                     | 5-phase protoLabs setup pipeline                    |
| [CI/CD Setup](./protolabs/ci-cd-setup.md)                           | CI/CD pipeline setup for protoLabs                  |
| [Flow Development Pattern](./protolabs/flow-development-pattern.md) | 5-layer flow development pattern                    |
| [Content Pipeline](./protolabs/content-pipeline.md)                 | AI content creation workflow                        |
| [Antagonistic Review](./protolabs/antagonistic-review.md)           | Adversarial content quality review                  |
| [Open Source Strategy](./protolabs/open-source-strategy.md)         | Open source licensing and community strategy        |
| [Landing Pages](./protolabs/landing-pages.md)                       | Landing page design and deployment                  |

## Templates

| Document                                              | Description                       |
| ----------------------------------------------------- | --------------------------------- |
| [Overview](./templates/index.md)                      | Project templates for protoLabs   |
| [Browser Extension](./templates/browser-extension.md) | Chrome extension starter template |

## Archived

| Document                                                   | Description                                        |
| ---------------------------------------------------------- | -------------------------------------------------- |
| [Engine Architecture](./archived/engine-architecture.md)   | Lead Engineer state machine ADR (content migrated) |
| [Competitive Analysis](./archived/competitive-analysis.md) | Early competitive landscape analysis               |

## Legal

| Document                      | Description                       |
| ----------------------------- | --------------------------------- |
| [Disclaimer](./disclaimer.md) | Security disclaimer and liability |
