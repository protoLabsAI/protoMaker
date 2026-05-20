# System Architecture

This document covers how a single protoLabs.studio instance is structured —
what runs on the machine, how the services connect, and how the instance
coordinates with external systems (GitHub, Discord) for code and team
communication.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User's Machine                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐      ┌─────────────────────────────────────────────────┐  │
│  │              │      │              Docker Environment                  │  │
│  │   Browser    │      │                                                  │  │
│  │              │      │  ┌─────────────┐       ┌─────────────────────┐  │  │
│  │  localhost   │─────▶│  │     UI      │       │       Server        │  │  │
│  │  :3007 (UI)  │      │  │   (nginx)   │──────▶│     (Node.js)       │  │  │
│  │  :3008 (API) │      │  │             │       │                     │  │  │
│  │  :3009 (Docs)│      │  │  - Static   │  API  │  - Express routes   │  │  │
│  │              │      │  │    files    │  WS   │  - WebSocket        │  │  │
│  └──────────────┘      │  │  - Proxy    │       │  - Agent runner     │  │  │
│                        │  │             │       │  - Terminal (PTY)   │  │  │
│                        │  └─────────────┘       └──────────┬──────────┘  │  │
│                        │                                    │             │  │
│                        │  ┌─────────────┐                  │             │  │
│                        │  │    Docs     │                  │             │  │
│                        │  │  (nginx)    │                  │             │  │
│                        │  │  VitePress  │                  │             │  │
│                        │  │  :80→:3009  │                  │             │  │
│                        │  └─────────────┘                  │             │  │
│                        │         │                         │             │  │
│                        │         │                         │             │  │
│                        │  ┌──────┴─────────────────────────┴──────────┐  │  │
│                        │  │              Docker Volumes                │  │  │
│                        │  │                                            │  │  │
│                        │  │  automaker-data    automaker-claude-config │  │  │
│                        │  │  automaker-cursor-config  (+ opencode)     │  │  │
│                        │  └────────────────────────────────────────────┘  │  │
│                        └─────────────────────────────────────────────────┘  │
│                                              │                               │
│                        ┌─────────────────────┴─────────────────────┐        │
│                        │        (Optional) Mounted Projects         │        │
│                        │         /home/user/dev/projects            │        │
│                        └───────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS
                                        ▼
                              ┌─────────────────────┐
                              │   External APIs     │
                              │                     │
                              │  - Anthropic API    │
                              │  - GitHub API       │
                              └─────────────────────┘
```

## Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    automaker-ui (nginx:alpine)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Port 80 (mapped to host:3007)                                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      nginx.conf                           │   │
│  │                                                           │   │
│  │  location / {                                             │   │
│  │      # Serve React SPA                                    │   │
│  │      try_files $uri /index.html;                          │   │
│  │  }                                                        │   │
│  │                                                           │   │
│  │  location /api {                                          │   │
│  │      # Proxy to server container                          │   │
│  │      proxy_pass http://server:3008;                       │   │
│  │      # WebSocket upgrade support                          │   │
│  │  }                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  /usr/share/nginx/html/                                          │
│  ├── index.html                                                  │
│  ├── assets/                                                     │
│  └── ...                                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 automaker-server (node:22-slim)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Port 3008 (API + WebSocket)                                     │
│  User: automaker (non-root)                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Express Server                         │   │
│  │                                                           │   │
│  │  /api/health        - Health check                        │   │
│  │  /api/features/*    - Feature CRUD                        │   │
│  │  /api/agents/*      - Agent control                       │   │
│  │  /api/terminal/*    - Terminal sessions                   │   │
│  │  /api/auto-mode/*   - Auto-mode control                   │   │
│  │  /api (WebSocket)   - Real-time events                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  CLI Tools Available:                                            │
│  ├── claude (Anthropic CLI)                                      │
│  ├── cursor-agent (Cursor CLI)                                   │
│  ├── opencode (OpenCode CLI)                                     │
│  ├── gh (GitHub CLI)                                             │
│  └── git                                                         │
│                                                                  │
│  Volumes:                                                        │
│  ├── /data                    (automaker-data)                   │
│  ├── /home/automaker/.claude  (automaker-claude-config)          │
│  ├── /home/automaker/.cursor  (automaker-cursor-config)          │
│  └── /projects                (optional mount)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  automaker-docs (nginx:alpine)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Port 80 (mapped to host:3009)                                   │
│                                                                  │
│  VitePress static site built from docs/ directory                │
│                                                                  │
│  /usr/share/nginx/html/                                          │
│  ├── index.html          (landing page)                          │
│  ├── agents/             (agent documentation)                   │
│  ├── infra/              (infrastructure docs)                   │
│  ├── integrations/       (integration guides)                    │
│  ├── getting-started/    (onboarding)                            │
│  └── assets/             (static assets)                         │
│                                                                  │
│  Auto-deploys on push to main via GitHub Actions                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Request Flow

### HTTP Request

```
Browser                 nginx (UI)              Express (Server)
   │                       │                          │
   │  GET /api/features    │                          │
   │ ─────────────────────▶│                          │
   │                       │  proxy_pass              │
   │                       │ ────────────────────────▶│
   │                       │                          │
   │                       │      JSON response       │
   │                       │ ◀────────────────────────│
   │    JSON response      │                          │
   │ ◀─────────────────────│                          │
   │                       │                          │
```

### WebSocket Connection

```
Browser                 nginx (UI)              Express (Server)
   │                       │                          │
   │  WS /api              │                          │
   │ ─────────────────────▶│                          │
   │                       │  Upgrade: websocket      │
   │                       │ ────────────────────────▶│
   │                       │                          │
   │       WS Established  │     WS Established       │
   │ ◀─────────────────────│◀────────────────────────▶│
   │                       │                          │
   │                       │      Event: agent_output │
   │                       │ ◀────────────────────────│
   │   Event: agent_output │                          │
   │ ◀─────────────────────│                          │
   │                       │                          │
```

## Data Flow

### Agent Execution

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌─────────────┐
│   UI     │    │  Server  │    │ Claude Agent │    │ Anthropic   │
│          │    │          │    │   SDK        │    │ API         │
└────┬─────┘    └────┬─────┘    └──────┬───────┘    └──────┬──────┘
     │               │                 │                   │
     │ Start Agent   │                 │                   │
     │──────────────▶│                 │                   │
     │               │                 │                   │
     │               │ Create Agent    │                   │
     │               │────────────────▶│                   │
     │               │                 │                   │
     │               │                 │ API Request       │
     │               │                 │──────────────────▶│
     │               │                 │                   │
     │               │                 │ Response + Tools  │
     │               │                 │◀──────────────────│
     │               │                 │                   │
     │               │ Stream Output   │                   │
     │               │◀────────────────│                   │
     │               │                 │                   │
     │ WS: Output    │                 │                   │
     │◀──────────────│                 │                   │
     │               │                 │                   │
     │               │ Completion      │                   │
     │               │◀────────────────│                   │
     │               │                 │                   │
     │ WS: Complete  │                 │                   │
     │◀──────────────│                 │                   │
     │               │                 │                   │
```

## Volume Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Docker Volumes                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │  automaker-data     │    │  Contents:                      │ │
│  │  /data              │───▶│  ├── settings.json              │ │
│  │                     │    │  ├── credentials.json           │ │
│  └─────────────────────┘    │  ├── sessions-metadata.json     │ │
│                             │  └── agent-sessions/            │ │
│                             └─────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ automaker-claude-   │    │  Contents:                      │ │
│  │ config              │───▶│  ├── .credentials.json          │ │
│  │ ~/.claude           │    │  └── settings.json              │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ automaker-cursor-   │    │  Contents:                      │ │
│  │ config              │───▶│  └── (cursor CLI config)        │ │
│  │ ~/.cursor           │    └─────────────────────────────────┘ │
│  └─────────────────────┘                                        │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ (Optional mount)    │    │  User's projects directory      │ │
│  │ /home/user/dev      │───▶│  with .automaker/ subdirs       │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## CI/CD Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         GitHub Actions                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Push to PR / Main                                                        │
│       │                                                                   │
│       ├──────────────────┬──────────────────┬─────────────────┐          │
│       │                  │                  │                 │          │
│       ▼                  ▼                  ▼                 ▼          │
│  ┌─────────┐      ┌─────────────┐    ┌───────────┐    ┌────────────┐    │
│  │  test   │      │  e2e-tests  │    │ pr-check  │    │format-check│    │
│  │         │      │             │    │           │    │            │    │
│  │ vitest  │      │ playwright  │    │ build:dir │    │  prettier  │    │
│  └─────────┘      └─────────────┘    └───────────┘    └────────────┘    │
│       │                  │                  │                 │          │
│       └──────────────────┴──────────────────┴─────────────────┘          │
│                                    │                                      │
│                                    ▼                                      │
│                              All Checks Pass                              │
│                                    │                                      │
│                                    ▼                                      │
│                              Ready to Merge                               │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         Release Published                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────┬─────────────────┬─────────────────┐                 │
│  │                 │                 │                 │                 │
│  ▼                 ▼                 ▼                 │                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐          │                 │
│  │  macOS    │  │  Windows  │  │  Linux    │          │                 │
│  │           │  │           │  │           │          │                 │
│  │ .dmg .zip │  │   .exe    │  │ .AppImage │          │                 │
│  │           │  │           │  │ .deb .rpm │          │                 │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘          │                 │
│        │              │              │                │                 │
│        └──────────────┴──────────────┘                │                 │
│                       │                               │                 │
│                       ▼                               │                 │
│               Upload to Release                       │                 │
│                                                       │                 │
└──────────────────────────────────────────────────────────────────────────┘
```

## Network Topology

### Production (Isolated)

```
                    Internet
                        │
                        │ (no external access)
                        │
┌───────────────────────┼───────────────────────────┐
│                       │                           │
│                  localhost                        │
│          ┌────────────┴───────────┐              │
│          │                        │              │
│     :3007 (UI)              :3008 (API)          │
│          │                        │              │
│  ┌───────┴───────┐       ┌───────┴───────┐      │
│  │  automaker-ui │◀─────▶│automaker-server│      │
│  │    (nginx)    │ Docker│   (Node.js)   │      │
│  └───────────────┘Network└───────────────┘      │
│                                                  │
│                       │                          │
│                       ▼                          │
│              Docker Volumes Only                 │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Development (Mounted)

```
                    Internet
                        │
                        │
┌───────────────────────┼───────────────────────────┐
│                       │                           │
│                  localhost                        │
│          ┌────────────┴───────────┐              │
│          │                        │              │
│     :3007 (UI)              :3008 (API)          │
│          │                        │              │
│  ┌───────┴───────┐       ┌───────┴───────┐      │
│  │  automaker-ui │◀─────▶│automaker-server│      │
│  └───────────────┘       └───────┬───────┘      │
│                                  │               │
│              ┌───────────────────┤               │
│              │                   │               │
│              ▼                   ▼               │
│     ┌────────────────┐  ┌────────────────┐      │
│     │ Docker Volumes │  │  Host Mount    │      │
│     │  - data        │  │ /home/user/dev │      │
│     │  - configs     │  └────────────────┘      │
│     └────────────────┘                          │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Deployment Topology

A protoLabs.studio instance is a single-process deployment that hosts the
board, AI agents, and worktrees on one machine. It coordinates with the
outside world through two channels:

- **GitHub** — feature PRs, reviews, CI, and merge events.
- **Discord** — async team communication, status notifications, HITL prompts.

```text
┌──────────────────────────────────────────────────────────────────┐
│                       External Coordination                       │
│                                                                    │
│   ┌────────────────────┐         ┌─────────────────────────┐     │
│   │      GitHub         │         │         Discord          │     │
│   │  (Code, PRs, CI)    │         │  (Comms, notifications)  │     │
│   └────────────────────┘         └─────────────────────────┘     │
│            ▲                                  ▲                    │
│            │ webhooks, PR ops                 │ events, alerts     │
└────────────┼──────────────────────────────────┼───────────────────┘
             │                                  │
             ▼                                  ▼
   ┌──────────────────────────────────────────────────────────┐
   │                 protoLabs.studio instance                  │
   │                                                            │
   │   Kanban board · auto-mode · AI agents · git worktrees    │
   │   .automaker/ project context · settings · features       │
   └──────────────────────────────────────────────────────────┘
```

**What stays local to the instance:**

- Agent conversation logs and raw output
- Individual feature status transitions
- Git worktree management
- Build/test results

**What propagates to GitHub:**

- Feature completion (PRs, reviews, merges)
- CI status
- Cross-team coordination (issues, comments)

**What goes to Discord:**

- Status notifications (feature started/completed)
- Escalation requests (HITL approval needed)
- Deploy / release notifications

### Secret Flow

```
Infisical (Proxmox)
       │
       │  infisical run
       ▼
┌──────────────────┐
│  Environment Vars │
│  injected into:   │
│                   │
│  • MCP servers    │
│  • Docker compose │
│  • CLI tools      │
│  • CI/CD          │
└──────────────────┘
```

See [secrets.md](./secrets.md) for detailed Infisical setup.

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trust Boundary                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Container Boundary                        │   │
│  │                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐             │   │
│  │  │ Non-root user   │    │ Network isolation│             │   │
│  │  │ (automaker)     │    │ (bridge network) │             │   │
│  │  └─────────────────┘    └─────────────────┘             │   │
│  │                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────┐             │   │
│  │  │ Volume isolation │    │ ALLOWED_ROOT_   │             │   │
│  │  │ (named volumes)  │    │ DIRECTORY       │             │   │
│  │  └─────────────────┘    └─────────────────┘             │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  External APIs (HTTPS):                                          │
│  ├── Anthropic API (authenticated)                               │
│  ├── GitHub API (authenticated)                                  │
│  ├── Proxmox API (authenticated, VPN recommended)                │
│  └── npm registry (public)                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Proxmox MCP Integration

The Proxmox MCP server provides Claude Code with direct management of VMs and containers on the Proxmox hypervisor.

### Setup

**Repository:** [protoLabsAI/mcp-proxmox](https://github.com/protoLabsAI/mcp-proxmox) (hardened fork of gilby125/mcp-proxmox)

**Required env vars:**

| Variable                 | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `PROXMOX_HOST`           | Proxmox IP/hostname (VPN IP recommended)           |
| `PROXMOX_USER`           | API user (e.g., `root@pam` or dedicated `mcp@pve`) |
| `PROXMOX_TOKEN_NAME`     | API token ID                                       |
| `PROXMOX_TOKEN_VALUE`    | API token secret                                   |
| `PROXMOX_ALLOW_ELEVATED` | `false` (read-only) or `true` (destructive ops)    |

**Claude Code config (user-level in `~/.claude.json`):**

```json
{
  "proxmox": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "github:protoLabsAI/mcp-proxmox"],
    "env": {
      "PROXMOX_HOST": "${PROXMOX_HOST}",
      "PROXMOX_TOKEN_NAME": "${PROXMOX_TOKEN_NAME}",
      "PROXMOX_TOKEN_VALUE": "${PROXMOX_TOKEN_VALUE}",
      "PROXMOX_USER": "${PROXMOX_USER}",
      "PROXMOX_ALLOW_ELEVATED": "false"
    }
  }
}
```

### Permission Tiers

| Mode            | `PROXMOX_ALLOW_ELEVATED` | Operations                                                     |
| --------------- | ------------------------ | -------------------------------------------------------------- |
| Basic (default) | `false`                  | List nodes, VMs, storage, cluster status                       |
| Elevated        | `true`                   | Create/delete VMs, snapshots, backups, disk/network management |

### Security Hardening (applied in our fork)

- All parameters validated before use in API URLs (node, vmid, storage, snapshot, disk, net, bridge, mp)
- `PROXMOX_HOST` and `PROXMOX_TOKEN_VALUE` are required (no silent fallbacks)
- Updated MCP SDK to v1.26.0
- Deterministic lockfile committed
- Removed unnecessary `https` npm package
- Upstream PR: https://github.com/gilby125/mcp-proxmox/pull/3

### Proxmox API Token Setup

1. Log into Proxmox web UI
2. Datacenter > Permissions > API Tokens
3. Create a token for the desired user
4. For read-only: no special permissions needed
5. For elevated: grant `VM.Allocate`, `VM.PowerMgmt`, `VM.Snapshot`, `VM.Backup`, `VM.Config`
6. **Recommended:** Use privilege separation and a dedicated `mcp@pve` user with minimal permissions
