# protoLabs Documentation

## Quick Links

| Service  | URL                                                                         | Description                       |
| -------- | --------------------------------------------------------------------------- | --------------------------------- |
| GitHub   | [proto-labs-ai/automaker](https://github.com/proto-labs-ai/automaker)       | Source code, issues, PRs          |
| Linear   | [protolabsai](https://linear.app/protolabsai)                               | Strategic roadmap and initiatives |
| Graphite | [proto-labs-ai](https://app.graphite.dev/github/pr/proto-labs-ai/automaker) | Stacked PR dashboard              |
| Discord  | [Agentic Jumpstart](https://discord.gg/jjem7aEDKU)                          | Community and team chat           |

## Getting Started

| Document                                                               | Description                      |
| ---------------------------------------------------------------------- | -------------------------------- |
| [Overview](./getting-started/index.md)                                 | What is Automaker, key concepts  |
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

| Document                                                   | Description                                            |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| [Architecture](./infra/architecture.md)                    | System diagrams, service map, hardware topology        |
| [Docker](./infra/docker.md)                                | Dockerfile architecture, multi-stage builds            |
| [Docker Compose](./infra/docker-compose.md)                | Compose variants, volumes, environment                 |
| [Deployment](./infra/deployment.md)                        | Deployment options (local, Docker, systemd)            |
| [Staging](./infra/staging-deployment.md)                   | Staging server setup, high-concurrency agents          |
| [Secrets](./infra/secrets.md)                              | Infisical setup, MCP secret injection, team onboarding |
| [Networking](./infra/networking.md)                        | Ports, nginx, CORS, WebSocket, Tailscale VPN           |
| [Security](./infra/security.md)                            | Container security, credential management              |
| [CI/CD](./infra/ci-cd.md)                                  | GitHub Actions workflows                               |
| [Monitoring](./infra/monitoring.md)                        | Health checks, logging, observability                  |
| [Backup & Recovery](./infra/backup-recovery.md)            | Volume backups, restore procedures                     |
| [systemd](./infra/systemd.md)                              | systemd service configuration                          |
| [Troubleshooting](./infra/troubleshooting.md)              | Common issues and solutions                            |
| [Ava Headless Monitor](./infra/ava-headless-quickstart.md) | Autonomous monitoring setup (local/staging/Docker)     |

## Integrations

| Document                                               | Description                                      |
| ------------------------------------------------------ | ------------------------------------------------ |
| [Claude Plugin](./integrations/claude-plugin.md)       | MCP server, plugin installation, tool reference  |
| [Discord](./integrations/discord.md)                   | Discord channels, bot integration, event routing |
| [API Key Profiles](./integrations/api-key-profiles.md) | Unified API key and provider profile system      |

## Server Reference

| Document                                             | Description                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| [Route Organization](./server/route-organization.md) | Express route structure and patterns             |
| [Providers](./server/providers.md)                   | AI provider architecture (Claude, Cursor, Codex) |
| [Utilities](./server/utilities.md)                   | Server utility functions reference               |

## Authority System

| Document                              | Description                                    |
| ------------------------------------- | ---------------------------------------------- |
| [Org Chart](./authority/org-chart.md) | Trust hierarchy, role permissions, team design |
| [Team Roles](./authority/roles.md)    | Active team members and role definitions       |

## Development

| Document                                                | Description                              |
| ------------------------------------------------------- | ---------------------------------------- |
| [UI Architecture](./dev/ui-architecture.md)             | Frontend structure and patterns          |
| [Shared Packages](./dev/shared-packages.md)             | Monorepo package architecture            |
| [Feature Status System](./dev/feature-status-system.md) | 6-status feature lifecycle               |
| [Adding Team Members](./dev/adding-team-members.md)     | Onboarding new team members              |
| [Clean Code](./dev/clean-code.md)                       | Code quality standards and patterns      |
| [Folder Pattern](./dev/folder-pattern.md)               | Directory structure conventions          |
| [Add Cursor Model](./dev/add-new-cursor-model.md)       | Adding new Cursor model support          |
| [Release](./dev/release.md)                             | Release process and Electron builds      |
| [Terminal](./dev/terminal.md)                           | Terminal feature documentation           |
| [Docs Site](./dev/docs-site.md)                         | VitePress docs site setup and deployment |
| [Docs Site Decision](./dev/docs-site-decision.md)       | ADR: Why VitePress was chosen            |

## ProtoLabs

| Document                                        | Description                        |
| ----------------------------------------------- | ---------------------------------- |
| [Setup Pipeline](./protolabs/setup-pipeline.md) | 5-phase ProtoLab setup pipeline    |
| [Philosophy](./protolabs/philosophy.md)         | ProtoLab design philosophy         |
| [Gold Standard](./protolabs/gold-standard.md)   | Gold standard practices            |
| [CI/CD Setup](./protolabs/ci-cd-setup.md)       | CI/CD pipeline setup for ProtoLabs |

## Archived

Completed work and superseded docs in [`docs/archived/`](./archived/):

| Document                                                                    | Reason                              |
| --------------------------------------------------------------------------- | ----------------------------------- |
| [Settings API Migration](./archived/settings-api-migration.md)              | Migration complete                  |
| [PR Comment Fix Agent](./archived/pr-comment-fix-agent.md)                  | Superseded by skills system         |
| [PR Comment Fix Prompt](./archived/pr-comment-fix-prompt.md)                | Superseded by skills system         |
| [Production Deployment (Swarm)](./archived/production-deployment.md)        | Superseded by Docker Compose deploy |
| [ProtoLab Setup Guide](./archived/protolab-setup-guide.md)                  | Implementation complete             |
| [ProtoLab Test Summary](./archived/protolab-test-summary.md)                | Test results archive                |
| [Setup Lab Implementation](./archived/setup-lab-implementation.md)          | Implementation complete             |
| [SetupLab Audit](./archived/setuplab-audit.md)                              | Audit complete                      |
| [Backlog Review](./archived/backlog-review.md)                              | Point-in-time triage                |
| [Self-Learning Proposal](./archived/self-learning-self-healing-proposal.md) | Partially implemented               |
| [CodeRabbit Pipeline](./archived/coderabbit-pipeline-linear-project.md)     | Superseded by CI/CD workflows       |

## Legal

| Document                      | Description                       |
| ----------------------------- | --------------------------------- |
| [Disclaimer](./disclaimer.md) | Security disclaimer and liability |
