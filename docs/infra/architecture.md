# System Architecture

This document covers both the single-instance architecture (what runs on one machine)
and the multi-instance topology (how multiple Automaker instances coordinate as
autonomous dev teams via Linear and Discord).

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
│  │    :3007     │      │  │   (nginx)   │──────▶│     (Node.js)       │  │  │
│  │              │      │  │             │       │                     │  │  │
│  └──────────────┘      │  │  - Static   │  API  │  - Express routes   │  │  │
│                        │  │    files    │  WS   │  - WebSocket        │  │  │
│                        │  │  - Proxy    │       │  - Agent runner     │  │  │
│                        │  │             │       │  - Terminal (PTY)   │  │  │
│                        │  └─────────────┘       └──────────┬──────────┘  │  │
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

## Multi-Instance Topology

Automaker is designed to run as multiple independent instances, each acting as an
autonomous development team. Coordination happens through Linear (project management)
and Discord (communication), not through direct instance-to-instance communication.

### Organizational Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Coordination Layer                                │
│                                                                           │
│  ┌──────────────────────────┐    ┌──────────────────────────────────┐   │
│  │        Linear             │    │           Discord                 │   │
│  │  (Project Management)     │    │      (Team Communication)        │   │
│  │                           │    │                                   │   │
│  │  Initiatives              │    │  #dev - status updates           │   │
│  │   └─ Projects             │    │  #alerts - CI/deploy notifs      │   │
│  │       └─ Issues           │    │  #approvals - HITL requests      │   │
│  │           └─ Sub-issues   │    │                                   │   │
│  └──────────────────────────┘    └──────────────────────────────────┘   │
│              │                                    │                       │
│              │  distilled updates                 │  notifications        │
│              │  (pertinent info only)             │  (summaries only)     │
│              │                                    │                       │
├──────────────┼────────────────────────────────────┼───────────────────────┤
│              │         Execution Layer             │                       │
│              ▼                                    ▼                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  Automaker        │  │  Automaker        │  │  Automaker        │       │
│  │  Instance A       │  │  Instance B       │  │  Instance N       │       │
│  │  (Team Alpha)     │  │  (Team Beta)      │  │  (Team ...)       │       │
│  │                   │  │                   │  │                   │       │
│  │  Kanban Board     │  │  Kanban Board     │  │  Kanban Board     │       │
│  │  AI Agents        │  │  AI Agents        │  │  AI Agents        │       │
│  │  Git Worktrees    │  │  Git Worktrees    │  │  Git Worktrees    │       │
│  │  Local Context    │  │  Local Context    │  │  Local Context    │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Information Flow (Bottom-Up Distillation)

Each layer only pushes the most pertinent information upward. Raw agent output
stays local; summaries and outcomes propagate to coordination tools.

```
AI Agent (PE)                    Does the work, produces code + output
    │
    │ completion status, errors, PR links
    ▼
Automaker Board (Team Lead)      Local Kanban tracks features, manages agents
    │
    │ milestone progress, blockers, key decisions
    ▼
Linear Issues (Project Manager)  Cross-team visibility, priority, scheduling
    │
    │ project health, risk flags, milestone rollups
    ▼
Linear Projects (PM / CTO)      Strategic view, resource allocation
```

**What stays local (Automaker instance):**

- Agent conversation logs and raw output
- Individual feature status transitions
- Git worktree management
- Build/test results

**What propagates to Linear:**

- Feature completion (issue status updates)
- Blockers requiring cross-team coordination
- Milestone progress summaries
- Architecture decisions needing approval

**What goes to Discord:**

- Status notifications (feature started/completed)
- Escalation requests (HITL approval needed)
- Cross-team announcements
- CI/CD pipeline results

### Role Mapping

| Role                     | Where It Lives     | Responsibility                            |
| ------------------------ | ------------------ | ----------------------------------------- |
| CTO (Human)              | Linear + Discord   | Strategic direction, final approvals      |
| PM                       | Linear projects    | What to build, why, priorities            |
| Project Manager          | Linear issues      | When, how, milestone tracking             |
| EM (Engineering Manager) | Automaker instance | Who does what, capacity, agent assignment |
| PE (Product Engineer)    | Automaker agent    | Implementation, code, tests, PRs          |

See the [Hierarchical Agent Organization System](https://linear.app/protolabsai) project in Linear (PRO-13 through PRO-34) for the implementation plan.

### Each Instance is Autonomous

Each Automaker instance:

- Has its own Kanban board with features and backlog
- Runs its own AI agents in isolated git worktrees
- Maintains its own project context (`.automaker/context/`)
- Manages its own auto-mode and feature queue
- Reports upward via MCP integrations (Linear, Discord)

Instances do NOT communicate directly with each other. All cross-team
coordination happens through the coordination layer (Linear + Discord).

## Infrastructure Topology

### Hardware Inventory

| Machine  | Role                                  | Specs                | Tailscale Name               |
| -------- | ------------------------------------- | -------------------- | ---------------------------- |
| Main Rig | Primary Automaker instance            | 128GB RAM, 48GB VRAM | `mainrig` (adjust to actual) |
| Proxmox  | Infrastructure + additional instances | 32GB RAM             | `proxmox` (adjust to actual) |

### Service Map

```
┌────────────────────────────────────────────────────────────────┐
│                       Tailscale Mesh                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Main Rig (128GB RAM, 48GB VRAM)                               │
│  ├── Automaker Instance (primary dev team)                     │
│  │   ├── Server (:3008)                                        │
│  │   ├── UI (:3007)                                            │
│  │   └── MCP Servers (automaker, discord, linear, proxmox)     │
│  ├── Claude Code CLI                                            │
│  └── Docker (containers + volumes)                              │
│                                                                 │
│  Proxmox Server (32GB RAM)                                     │
│  ├── Infisical (:8080) — secret management                     │
│  ├── PostgreSQL (Infisical backend)                             │
│  ├── Redis (Infisical cache)                                    │
│  └── Automaker Instance(s) (additional dev teams, optional)    │
│                                                                 │
│  External (via Cloudflare Tunnel, if needed)                    │
│  ├── GitHub Webhooks → Automaker Instances                      │
│  └── CI/CD → Infisical API                                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

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
│  ├── Proxmox API (authenticated, Tailscale)                      │
│  └── npm registry (public)                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Proxmox MCP Integration

The Proxmox MCP server provides Claude Code with direct management of VMs and containers on the Proxmox hypervisor.

### Setup

**Repository:** [proto-labs-ai/mcp-proxmox](https://github.com/proto-labs-ai/mcp-proxmox) (hardened fork of gilby125/mcp-proxmox)

**Required env vars:**

| Variable                 | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `PROXMOX_HOST`           | Proxmox IP/hostname (Tailscale IP recommended)     |
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
    "args": ["-y", "github:proto-labs-ai/mcp-proxmox"],
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
