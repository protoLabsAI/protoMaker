# protoLabs Studio Documentation

## Quick Links

| Service  | URL                                                                                 | Description              |
| -------- | ----------------------------------------------------------------------------------- | ------------------------ |
| GitHub   | [proto-labs-ai/protolabs-studio](https://github.com/proto-labs-ai/protolabs-studio) | Source code, issues, PRs |
| Graphite | [proto-labs-ai](https://app.graphite.dev/github/pr/proto-labs-ai/protolabs-studio)  | Stacked PR dashboard     |
| Discord  | [Agentic Jumpstart](https://discord.gg/jjem7aEDKU)                                  | Community and team chat  |

## Getting Started

| Document                                                               | Description                      |
| ---------------------------------------------------------------------- | -------------------------------- |
| [Overview](./getting-started/index.md)                                 | What is protoMaker, key concepts |
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

| Document                                                | Description                               |
| ------------------------------------------------------- | ----------------------------------------- |
| [Frontend Philosophy](./dev/frontend-philosophy.md)     | Gold standard frontend decisions          |
| [UI Architecture](./dev/ui-architecture.md)             | Frontend structure and patterns           |
| [Shared Packages](./dev/shared-packages.md)             | Monorepo package architecture             |
| [Feature Status System](./dev/feature-status-system.md) | 6-status feature lifecycle                |
| [Adding Team Members](./dev/adding-team-members.md)     | Onboarding new team members               |
| [Clean Code](./dev/clean-code.md)                       | Code quality standards and patterns       |
| [Folder Pattern](./dev/folder-pattern.md)               | Directory structure conventions           |
| [Add Cursor Model](./dev/add-new-cursor-model.md)       | Adding new Cursor model support           |
| [Release](./dev/release.md)                             | Release process and Electron builds       |
| [Terminal](./dev/terminal.md)                           | Terminal feature documentation            |
| [Docs Site](./dev/docs-site.md)                         | VitePress docs site setup and deployment  |
| [Docs Site Decision](./dev/docs-site-decision.md)       | ADR: Why VitePress was chosen             |
| [Docs Standard](./dev/docs-standard.md)                 | IA rules, content guidelines, maintenance |

## ProtoLabs

| Document                                        | Description                        |
| ----------------------------------------------- | ---------------------------------- |
| [Setup Pipeline](./protolabs/setup-pipeline.md) | 5-phase ProtoLab setup pipeline    |
| [CI/CD Setup](./protolabs/ci-cd-setup.md)       | CI/CD pipeline setup for ProtoLabs |

## Legal

| Document                      | Description                       |
| ----------------------------- | --------------------------------- |
| [Disclaimer](./disclaimer.md) | Security disclaimer and liability |
