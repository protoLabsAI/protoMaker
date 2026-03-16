# protoLabs Studio Documentation

## Getting Started

| Document                                                               | Description                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| [Overview](./getting-started/index.md)                                 | What is protoLabs, quick tutorial, key concepts |
| [Installation](./getting-started/installation.md)                      | Install the desktop app                         |
| [Installation (Fedora/RHEL)](./getting-started/installation-fedora.md) | Install on Fedora/RHEL Linux                    |

## Concepts

| Document                                               | Description                                               |
| ------------------------------------------------------ | --------------------------------------------------------- |
| [Agent Philosophy](./concepts/agent-philosophy.md)     | Why named personas, model tiers, worktree isolation       |
| [Agent Architecture](./concepts/agent-architecture.md) | Agent types, execution model, architecture layers         |
| [How It Works](./concepts/how-it-works.md)             | LangGraph agent execution flows and patterns              |
| [Prompt Engineering](./concepts/prompt-engineering.md) | Prompt composition, registry, writing effective prompts   |
| [Reliability & Recovery](./concepts/reliability.md)    | Failure handling, escalation, health sweeps               |
| [Escalation Routing](./concepts/escalation-routing.md) | Escalation channels, dedup, rate limiting, acknowledgment |
| [Pipeline](./concepts/pipeline.md)                     | The canonical 8-phase pipeline reference                  |
| [Feature Lifecycle](./concepts/feature-lifecycle.md)   | 5-status feature lifecycle                                |
| [Project Lifecycle](./concepts/project-lifecycle.md)   | Project state machine                                     |

## How-To Guides

| Document                                         | Description                              |
| ------------------------------------------------ | ---------------------------------------- |
| [Agent Manifests](./guides/agent-manifests.md)   | Define agent roles and capabilities      |
| [Agent Memory](./guides/agent-memory.md)         | Configure persistent agent memory        |
| [Context Files](./guides/context-files.md)       | Add project-specific rules for AI agents |
| [Writing Prompts](./guides/writing-prompts.md)   | Author effective agent prompts           |
| [Authoring Skills](./guides/authoring-skills.md) | Create reusable agent skills             |
| [Feature Flags](./guides/feature-flags.md)       | Feature flag system and conventions      |
| [Flow Control](./guides/flow-control.md)         | Control agent execution flow             |
| [Deployment Modes](./guides/deployment-modes.md) | Run in web, desktop, or headless mode    |
| [Gotchas](./guides/gotchas.md)                   | Known pitfalls and workarounds           |

## Starter Kits

| Document                                              | Description                                          |
| ----------------------------------------------------- | ---------------------------------------------------- |
| [Overview](./templates/index.md)                      | Available starter kits and how to scaffold them      |
| [Docs Starter](./templates/docs-starter.md)           | Create a documentation site with Starlight           |
| [Portfolio Starter](./templates/portfolio-starter.md) | Create a portfolio/marketing site with Astro + React |

## Reference

| Document                                              | Description                                  |
| ----------------------------------------------------- | -------------------------------------------- |
| [Workflow Settings](./reference/workflow-settings.md) | Per-project workflow configuration           |
| [Model Resolver](./reference/model-resolver.md)       | Model alias resolution and tier selection    |
| [Auto Mode](./reference/auto-mode.md)                 | Autonomous feature processing service        |
| [Knowledge Store](./reference/knowledge-store.md)     | SQLite FTS5 knowledge base for agent context |
| [Knowledge Hive](./reference/knowledge-hive.md)       | Multi-source knowledge aggregation           |
| [MCP Tools](./reference/mcp-tools.md)                 | Full MCP tool catalog (120+ tools)           |
| [API Key Profiles](./reference/api-key-profiles.md)   | Unified API key and provider profile system  |

## Integrations

| Document                                                 | Description                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| [Browser Extension](./integrations/browser-extension.md) | Chrome extension for side panel chat, context menu, and GitHub |
| [Claude Plugin](./integrations/claude-plugin.md)         | Plugin installation, configuration, Docker deployment          |
| [Plugin Quickstart](./integrations/plugin-quickstart.md) | 5-minute happy-path setup guide                                |
| [Plugin Deep Dive](./integrations/plugin-deep-dive.md)   | Architecture, hooks, tools, and extension points               |
| [Plugin Commands](./integrations/plugin-commands.md)     | Commands reference, subagents, step-by-step examples           |
| [Discord](./integrations/discord.md)                     | Discord channels, bot integration, event routing               |
| [GitHub](./integrations/github.md)                       | GitHub integration, PR workflows, webhooks                     |
| [Langfuse](./integrations/langfuse.md)                   | Tracing, cost tracking, scoring, MCP tools                     |

## Self-Hosting

| Document                                                      | Description                                      |
| ------------------------------------------------------------- | ------------------------------------------------ |
| [Architecture](./self-hosting/architecture.md)                | System diagrams, multi-instance topology         |
| [Docker](./self-hosting/docker.md)                            | Dockerfile architecture, multi-stage builds      |
| [Docker Compose](./self-hosting/docker-compose.md)            | Compose variants, volumes, environment           |
| [Deployment](./self-hosting/deployment.md)                    | Deployment options (local, Docker, systemd)      |
| [High-Concurrency](./self-hosting/staging-deployment.md)      | High-concurrency deployment for many agents      |
| [Multi-Instance](./self-hosting/multi-instance-deployment.md) | Multi-instance deployment and coordination       |
| [Orchestration](./self-hosting/orchestration.md)              | Multi-instance orchestration and coordination    |
| [Secrets](./self-hosting/secrets.md)                          | Infisical setup, MCP secret injection            |
| [Networking](./self-hosting/networking.md)                    | Ports, nginx, CORS, WebSocket, reverse proxy     |
| [Security](./self-hosting/security.md)                        | Container security, credential management        |
| [CI/CD](./self-hosting/ci-cd.md)                              | GitHub Actions workflows                         |
| [Runners](./self-hosting/runners.md)                          | Self-hosted runner setup, memory limits, cleanup |
| [Monitoring](./self-hosting/monitoring.md)                    | Health checks, logging, observability            |
| [Observability](./self-hosting/observability.md)              | Infrastructure observability and metrics         |
| [Backup & Recovery](./self-hosting/backup-recovery.md)        | Volume backups, restore procedures               |
| [systemd](./self-hosting/systemd.md)                          | systemd service configuration                    |
| [Troubleshooting](./self-hosting/troubleshooting.md)          | Common issues and solutions                      |

## Legal

| Document                      | Description                       |
| ----------------------------- | --------------------------------- |
| [Disclaimer](./disclaimer.md) | Security disclaimer and liability |
