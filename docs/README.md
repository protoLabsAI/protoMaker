# protoLabs Studio Documentation

## Getting Started

| Document                                                               | Description                      |
| ---------------------------------------------------------------------- | -------------------------------- |
| [Overview](./getting-started/index.md)                                 | What is protoLabs, key concepts  |
| [Installation (Fedora/RHEL)](./getting-started/installation-fedora.md) | Install the desktop app on Linux |

## Agent System

Comprehensive agent documentation in [`docs/agents/`](./agents/):

| Document                                                   | Description                                        |
| ---------------------------------------------------------- | -------------------------------------------------- |
| [Architecture Overview](./agents/architecture.md)          | Agent types, execution model, architecture layers  |
| [Dynamic Role Registry](./agents/dynamic-role-registry.md) | Template-based agent creation, factory, execution  |
| [Agile Ceremonies](./agents/ceremonies.md)                 | Automated standups, retros, project retrospectives |
| [Adding Teammates](./agents/adding-teammates.md)           | How to create new authority agents (PM, EM, etc.)  |
| [Creating Agent Teams](./agents/creating-agent-teams.md)   | Multi-agent coordination and event-driven systems  |
| [MCP Integration](./agents/mcp-integration.md)             | How MCP tools interact with agents                 |
| [Context System](./agents/context-system.md)               | Context loading, memory files, smart selection     |

## Infrastructure

DevOps documentation in [`docs/infra/`](./infra/):

| Document                                               | Description                                        |
| ------------------------------------------------------ | -------------------------------------------------- |
| [Architecture](./infra/architecture.md)                | System diagrams, multi-instance topology           |
| [Docker](./infra/docker.md)                            | Dockerfile architecture, multi-stage builds        |
| [Docker Compose](./infra/docker-compose.md)            | Compose variants, volumes, environment             |
| [Deployment](./infra/deployment.md)                    | Deployment options (local, Docker, systemd)        |
| [High-Concurrency](./infra/staging-deployment.md)      | High-concurrency deployment for many agents        |
| [Secrets](./infra/secrets.md)                          | Infisical setup, MCP secret injection              |
| [Networking](./infra/networking.md)                    | Ports, nginx, CORS, WebSocket, reverse proxy       |
| [Security](./infra/security.md)                        | Container security, credential management          |
| [CI/CD](./infra/ci-cd.md)                              | GitHub Actions workflows                           |
| [Monitoring](./infra/monitoring.md)                    | Health checks, logging, observability              |
| [Backup & Recovery](./infra/backup-recovery.md)        | Volume backups, restore procedures                 |
| [systemd](./infra/systemd.md)                          | systemd service configuration                      |
| [Troubleshooting](./infra/troubleshooting.md)          | Common issues and solutions                        |
| [Headless Monitor](./infra/ava-headless-quickstart.md) | Autonomous monitoring setup (local/staging/Docker) |

## Integrations

| Document                                               | Description                                             |
| ------------------------------------------------------ | ------------------------------------------------------- |
| [Claude Plugin](./integrations/claude-plugin.md)       | MCP server, plugin installation, tool reference         |
| [Discord](./integrations/discord.md)                   | Discord channels, bot integration, event routing        |
| [Linear](./integrations/linear-sync.md)                | Agent interaction, project planning, bidirectional sync |
| [API Key Profiles](./integrations/api-key-profiles.md) | Unified API key and provider profile system             |

## Server Reference

| Document                                             | Description                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| [Route Organization](./server/route-organization.md) | Express route structure and patterns             |
| [Providers](./server/providers.md)                   | AI provider architecture (Claude, Cursor, Codex) |
| [Utilities](./server/utilities.md)                   | Server utility functions reference               |

## Authority System

| Document                              | Description                                      |
| ------------------------------------- | ------------------------------------------------ |
| [Org Chart](./authority/org-chart.md) | Trust hierarchy, role permissions, policy checks |
| [Team Roles](./authority/roles.md)    | Agent roles and responsibilities                 |

## Development

| Document                                                  | Description                                          |
| --------------------------------------------------------- | ---------------------------------------------------- |
| [Overview](./dev/index.md)                                | Development guide overview                           |
| [Design Philosophy](./dev/design-philosophy.md)           | UI design direction (Linear, Vercel, shadcn/ui)      |
| [Frontend Philosophy](./dev/frontend-philosophy.md)       | Gold standard frontend decisions                     |
| [UI Architecture](./dev/ui-architecture.md)               | Frontend structure and patterns                      |
| [Shared Packages](./dev/shared-packages.md)               | Monorepo package architecture                        |
| [Flows Package](./dev/flows.md)                           | LangGraph state graph primitives and patterns        |
| [LLM Providers Package](./dev/llm-providers-package.md)   | Multi-provider LLM abstraction layer                 |
| [Observability Package](./dev/observability-package.md)   | Langfuse tracing, prompt management, cost tracking   |
| [Langfuse Integration](./dev/langfuse-integration.md)     | Server-side tracing, scoring, MCP tools              |
| [Content Pipeline](./dev/content-pipeline.md)             | Content generation pipeline (blog, docs, training)   |
| [Antagonistic Review](./dev/antagonistic-review.md)       | Multi-perspective review with G-Eval scoring         |
| [CopilotKit Integration](./dev/copilotkit-integration.md) | AI chat sidebar and HITL approval flows              |
| [Engine Architecture](./dev/engine-architecture.md)       | Lead Engineer state machine, signal routing          |
| [PR Remediation Loop](./dev/pr-remediation-loop.md)       | Autonomous PR review feedback handling               |
| [Project Lifecycle](./dev/project-lifecycle.md)           | Linear-native project state machine                  |
| [Hivemind Interfaces](./dev/hivemind-interfaces.md)       | Service abstractions for multi-instance architecture |
| [Issue Management](./dev/issue-management.md)             | Automated failure-to-issue pipeline                  |
| [Feature Status System](./dev/feature-status-system.md)   | 6-status feature lifecycle                           |
| [Testing Patterns](./dev/testing-patterns.md)             | Test patterns and anti-patterns                      |
| [Clean Code](./dev/clean-code.md)                         | Code quality standards and patterns                  |
| [Release](./dev/release.md)                               | Release process and Electron builds                  |
| [Terminal](./dev/terminal.md)                             | Terminal feature documentation                       |
| [Docs Standard](./dev/docs-standard.md)                   | IA rules, content guidelines, maintenance            |

## protoLabs

| Document                                                            | Description                                         |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| [Overview](./protolabs/index.md)                                    | protoLabs methodology and guides                    |
| [Agency Overview](./protolabs/agency-overview.md)                   | How the full-loop automation system works           |
| [Agency Architecture](./protolabs/agency-architecture.md)           | System architecture, component inventory, data flow |
| [Setup Pipeline](./protolabs/setup-pipeline.md)                     | 5-phase protoLabs setup pipeline                    |
| [CI/CD Setup](./protolabs/ci-cd-setup.md)                           | CI/CD pipeline setup for protoLabs                  |
| [Flow Development Pattern](./protolabs/flow-development-pattern.md) | 5-layer flow development pattern                    |

## Internal

| Document                                                   | Description                               |
| ---------------------------------------------------------- | ----------------------------------------- |
| [Brand Identity](./internal/brand.md)                      | Brand bible: naming, voice, team, content |
| [Design System](./internal/design-system.md)               | Visual identity: surfaces, typography     |
| [Gotchas](./internal/gotchas.md)                           | Operational hazards and common pitfalls   |
| [Adding Team Members](./internal/adding-team-members.md)   | Onboarding new agent personas             |
| [Folder Pattern](./internal/folder-pattern.md)             | Directory structure conventions           |
| [Docs Site](./internal/docs-site.md)                       | VitePress setup and deployment            |
| [Docs Site Decision](./internal/docs-site-decision.md)     | ADR: why VitePress was chosen             |
| [Adding Cursor Models](./internal/add-new-cursor-model.md) | Adding new model support                  |

## Legal

| Document                      | Description                       |
| ----------------------------- | --------------------------------- |
| [Disclaimer](./disclaimer.md) | Security disclaimer and liability |
