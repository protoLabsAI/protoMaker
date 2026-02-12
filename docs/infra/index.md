# Infrastructure Documentation

This directory contains comprehensive documentation for Automaker's infrastructure, deployment, and DevOps processes.

## Quick Links

| Document                                  | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| [Docker](./docker.md)                     | Dockerfile architecture, multi-stage builds, base images |
| [Docker Compose](./docker-compose.md)     | Compose variants, environment variables, volumes         |
| [Deployment](./deployment.md)             | Production deployment options (systemd, Docker)          |
| [CI/CD](./ci-cd.md)                       | GitHub Actions workflows explained                       |
| [Monitoring](./monitoring.md)             | Health checks, logging, observability                    |
| [Backup & Recovery](./backup-recovery.md) | Volume backups, restore procedures                       |
| [systemd](./systemd.md)                   | systemd service configuration                            |
| [Networking](./networking.md)             | Ports, nginx, CORS, WebSocket proxying                   |
| [Secrets](./secrets.md)                   | Infisical deployment, MCP secret injection, team setup   |
| [Security](./security.md)                 | Container security, credentials management               |
| [Troubleshooting](./troubleshooting.md)   | Common issues and solutions                              |
| [Staging](./staging-deployment.md)        | Staging server setup, high-concurrency agent config      |
| [Architecture](./architecture.md)         | System architecture diagrams                             |

## Infrastructure Overview

Automaker uses a containerized architecture with two main services:

```
┌─────────────────────────────────────────────────────────┐
│                    Host Machine                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────────────────────────┐ │
│  │   Browser   │    │        Docker Containers         │ │
│  │             │    │  ┌───────────┐  ┌────────────┐  │ │
│  │  localhost  │────│─▶│    UI     │  │   Server   │  │ │
│  │    :3007    │    │  │  (nginx)  │──│  (Node.js) │  │ │
│  └─────────────┘    │  │   :80     │  │   :3008    │  │ │
│                     │  └───────────┘  └────────────┘  │ │
│                     │        │              │         │ │
│                     │        └──────────────┘         │ │
│                     │           WebSocket             │ │
│                     └─────────────────────────────────┘ │
│                                   │                     │
│                     ┌─────────────┴─────────────┐       │
│                     │      Docker Volumes       │       │
│                     │  - automaker-data         │       │
│                     │  - automaker-claude-config│       │
│                     │  - automaker-cursor-config│       │
│                     └───────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Deployment Options

### 1. Development (Local)

```bash
npm run dev           # Interactive launcher
npm run dev:web       # Web browser mode
npm run dev:electron  # Desktop app mode
```

### 2. Development (Docker)

```bash
docker compose -f docker-compose.dev.yml up
```

### 3. Production (Docker)

```bash
docker compose up -d
```

### 4. Production (systemd)

```bash
sudo systemctl enable automaker
sudo systemctl start automaker
```

## Key Files

### Docker

| File                   | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `Dockerfile`           | Multi-stage production build (server + UI targets) |
| `Dockerfile.dev`       | Development build with live reload support         |
| `docker-entrypoint.sh` | Permission and credential setup on container start |

### Docker Compose

| File                          | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `docker-compose.yml`          | Production (isolated, named volumes only) |
| `docker-compose.dev.yml`      | Development (source mounted, live reload) |
| `docker-compose.override.yml` | Local customization (gitignored)          |

### CI/CD Workflows

| File                                   | Purpose                        |
| -------------------------------------- | ------------------------------ |
| `.github/workflows/test.yml`           | Unit tests (Vitest)            |
| `.github/workflows/e2e-tests.yml`      | E2E tests (Playwright)         |
| `.github/workflows/pr-check.yml`       | Build verification             |
| `.github/workflows/format-check.yml`   | Prettier formatting            |
| `.github/workflows/security-audit.yml` | npm audit                      |
| `.github/workflows/release.yml`        | Multi-platform Electron builds |

### Scripts

| File                          | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `scripts/get-claude-token.sh` | Extract Claude OAuth from macOS Keychain |
| `scripts/get-cursor-token.sh` | Extract Cursor OAuth from macOS Keychain |

### Service

| File                 | Purpose                     |
| -------------------- | --------------------------- |
| `automaker.service`  | systemd unit file           |
| `apps/ui/nginx.conf` | Reverse proxy configuration |

## Ports

| Port | Service | Description                                  |
| ---- | ------- | -------------------------------------------- |
| 3007 | UI      | Web interface (nginx in Docker, Vite in dev) |
| 3008 | Server  | Backend API + WebSocket                      |

## Environment Variables

See [deployment.md](./deployment.md) for a complete list of environment variables.

## Using the /devops Skill

Automaker includes a `/devops` skill for managing infrastructure from Claude Code:

```
/devops           # Show container status
/devops health    # Run health diagnostics
/devops logs      # Analyze container logs
/devops backup    # Backup volumes
/devops restart   # Restart containers
/devops info      # Show configuration info
```
