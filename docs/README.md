# Automaker Documentation

## Quick Start

- **[CLAUDE.md](../CLAUDE.md)** - Project overview, architecture, common commands
- **[claude-plugin.md](./claude-plugin.md)** - MCP server setup and plugin guide
- **[production-deployment.md](./production-deployment.md)** - Production deployment guide

## Infrastructure

Comprehensive DevOps documentation in [`docs/infra/`](./infra/README.md):

| Document                                        | Description                                            |
| ----------------------------------------------- | ------------------------------------------------------ |
| [Architecture](./infra/architecture.md)         | System diagrams, service map, hardware topology        |
| [Docker](./infra/docker.md)                     | Dockerfile architecture, multi-stage builds            |
| [Docker Compose](./infra/docker-compose.md)     | Compose variants, volumes, environment                 |
| [Deployment](./infra/deployment.md)             | Deployment options (local, Docker, systemd)            |
| [Staging](./infra/staging-deployment.md)        | Staging server setup, high-concurrency agents          |
| [Secrets](./infra/secrets.md)                   | Infisical setup, MCP secret injection, team onboarding |
| [Networking](./infra/networking.md)             | Ports, nginx, CORS, WebSocket, Tailscale VPN           |
| [Security](./infra/security.md)                 | Container security, credential management              |
| [CI/CD](./infra/ci-cd.md)                       | GitHub Actions workflows                               |
| [Monitoring](./infra/monitoring.md)             | Health checks, logging, observability                  |
| [Backup & Recovery](./infra/backup-recovery.md) | Volume backups, restore procedures                     |
| [systemd](./infra/systemd.md)                   | systemd service configuration                          |
| [Troubleshooting](./infra/troubleshooting.md)   | Common issues and solutions                            |

## Agent System

Comprehensive agent architecture documentation in [`docs/agents/`](./agents/README.md):

| Document                                                 | Description                                       |
| -------------------------------------------------------- | ------------------------------------------------- |
| [Architecture Overview](./agents/architecture.md)        | Agent types, execution model, context system      |
| [Adding Teammates](./agents/adding-teammates.md)         | How to create new authority agents (PM, EM, etc.) |
| [Creating Agent Teams](./agents/creating-agent-teams.md) | Multi-agent coordination and event-driven systems |
| [MCP Integration](./agents/mcp-integration.md)           | How MCP tools interact with agents                |
| [Context System](./agents/context-system.md)             | Context loading, memory files, smart selection    |

## Server

| Document                                             | Description                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| [Route Organization](./server/route-organization.md) | Express route structure and patterns             |
| [Providers](./server/providers.md)                   | AI provider architecture (Claude, Cursor, Codex) |
| [Utilities](./server/utilities.md)                   | Server utility functions reference               |

## Integrations

| Document                                                       | Description                                     |
| -------------------------------------------------------------- | ----------------------------------------------- |
| [Claude Plugin](./claude-plugin.md)                            | MCP server, plugin installation, tool reference |
| [Discord](./discord.md)                                        | Discord bot integration and service layer       |
| [CodeRabbit Pipeline](./coderabbit-pipeline-linear-project.md) | CodeRabbit review automation pipeline           |
| [API Key Profiles](./UNIFIED_API_KEY_PROFILES.md)              | Unified API key and provider profile system     |

## Development Guides

| Document                                    | Description                              |
| ------------------------------------------- | ---------------------------------------- |
| [Git Workflow](./checkout-branch-pr.md)     | Branch checkout and PR creation workflow |
| [Clean Code](./clean-code.md)               | Code quality standards and patterns      |
| [Release](./release.md)                     | Release process and Electron builds      |
| [Context Files](./context-files-pattern.md) | Agent context file pattern               |
| [Shared Packages](./llm-shared-packages.md) | Monorepo package architecture            |
| [Terminal](./terminal.md)                   | Terminal feature documentation           |
| [Folder Pattern](./folder-pattern.md)       | Directory structure conventions          |

## Platform-Specific

| Document                                      | Description                         |
| --------------------------------------------- | ----------------------------------- |
| [Fedora Install](./install-fedora.md)         | Installation guide for Fedora Linux |
| [Add Cursor Model](./add-new-cursor-model.md) | Adding new Cursor model support     |

## Planning

| Document                                                           | Description                                     |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| [Backlog Review](./backlog-review.md)                              | Feature backlog triage and project organization |
| [Self-Learning Proposal](./self-learning-self-healing-proposal.md) | Proposal for agent learning system              |

## Archived

Completed migrations and superseded docs in [`docs/archived/`](./archived/):

| Document                                                       | Reason                                   |
| -------------------------------------------------------------- | ---------------------------------------- |
| [Settings API Migration](./archived/settings-api-migration.md) | Migration complete, historical reference |
| [PR Comment Fix Agent](./archived/pr-comment-fix-agent.md)     | Superseded by skills system              |
| [PR Comment Fix Prompt](./archived/pr-comment-fix-prompt.md)   | Superseded by skills system              |

## UI Documentation

Located in [`apps/ui/docs/`](../apps/ui/docs/):

| Document                                | Description                        |
| --------------------------------------- | ---------------------------------- |
| [Routes](../apps/ui/docs/routes.md)     | TanStack Router file-based routing |
| [Electron](../apps/ui/docs/electron.md) | Electron desktop app configuration |
