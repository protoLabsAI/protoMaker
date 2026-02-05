# System Architecture

This document provides architectural diagrams and explanations of Automaker's infrastructure.

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

## Infrastructure Topology

### Hardware Inventory

| Machine  | Role                          | Specs                | Tailscale Name               |
| -------- | ----------------------------- | -------------------- | ---------------------------- |
| Main Rig | Development, Automaker server | 128GB RAM, 48GB VRAM | `mainrig` (adjust to actual) |
| Proxmox  | Infrastructure services       | 32GB RAM             | `proxmox` (adjust to actual) |

### Service Map

```
┌────────────────────────────────────────────────────────────────┐
│                       Tailscale Mesh                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Main Rig (128GB RAM, 48GB VRAM)                               │
│  ├── Automaker Server (:3008)                                  │
│  ├── Automaker UI (:3007)                                      │
│  ├── Claude Code CLI (local)                                    │
│  ├── MCP Servers (automaker, discord, linear)                   │
│  └── Docker (containers + volumes)                              │
│                                                                 │
│  Proxmox Server (32GB RAM)                                     │
│  ├── Infisical (:8080) — secret management                     │
│  ├── PostgreSQL (Infisical backend)                             │
│  ├── Redis (Infisical cache)                                    │
│  └── (capacity for additional services)                         │
│                                                                 │
│  Developer Machines                                             │
│  ├── Claude Code CLI                                            │
│  ├── MCP Servers (secrets via Infisical)                        │
│  └── Browser → Main Rig Automaker UI                            │
│                                                                 │
│  External (via Cloudflare Tunnel, if needed)                    │
│  ├── GitHub Webhooks → Automaker Server                         │
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
│  └── npm registry (public)                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
