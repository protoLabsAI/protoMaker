# protoLabs Org Architecture

Canonical reference for every layer of the protoLabs stack. Use this as the starting point when onboarding agents, new team members, or systems that need to understand how everything connects.

Cross-links: [Fleet Architecture](./protolabs/fleet-architecture.md) | [Ava Operating Model](./protolabs/ava-operating-model.md) | [Portfolio Philosophy](./portfolio-philosophy.md)

---

## Full Stack Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SURFACE                                                   │
│  Discord · GitHub · Google Workspace (roadmap)                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  CLOUDFLARE TUNNEL                                                  │
│  ava.protoLabs.studio → automaker-server:3008                       │
│  chat.protoLabs.studio → openwebui:3000                             │
│  search.protoLabs.studio → searxng:8080                             │
│  llm.protoLabs.studio   → litellm:4000                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  GATEWAY LAYER                                                      │
│  LiteLLM · MCP Server · OpenWebUI · SearXNG                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  ORCHESTRATION LAYER                                                │
│  Workstacean — message bus, skill router, agent/project registry    │
└──────────┬──────────────────┬────────────────┬─────────────────────┘
           │                  │                │
┌──────────▼──────┐  ┌────────▼────────┐  ┌───▼─────────────────────┐
│  AGENT LAYER    │  │  DEV TOOLING    │  │  STRATEGIC LAYER        │
│  Ava Quinn Frank│  │  protoMaker     │  │  Plane (project mgmt)   │
│  Jon Cindi      │  │  automaker      │  │                         │
│  Researcher     │  │  Lead Engineer  │  │                         │
└─────────────────┘  └─────────────────┘  └─────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  OBSERVABILITY CROSS-CUT                                            │
│  Langfuse · MLflow · Prometheus+Grafana · Infisical                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  INFRASTRUCTURE                                                     │
│  ava node · protolabs node · pve01 · pi · MinIO · Tailscale         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## External Surface

### Discord

Primary human-agent interface. All agent conversations, project approvals, HITL prompts, and system alerts route through Discord.

- **Guild ID**: `1070606339363049492`
- **Key channels**: `#ava` (primary Ava interaction), `#dev` (code updates), `#infra` (alerts), `#bug-reports` (triage), `#deployments` (release notes)
- **Bot accounts**: `protoava[bot]` (Ava), `protoquinn[bot]` (Quinn) — each agent gets its own bot identity (per-agent Discord bot pool is a roadmap item; currently all bots share one token)
- **Connected to**: Workstacean Discord plugin (WebSocket, discord.js)

### GitHub

Event source for PR and issue lifecycle signals.

- **Org**: `protolabsai`
- **Primary repos**: `protoMaker` (automaker engine), `protoWorkstacean` (bus + registry), `homelab-iac` (deployment)
- **Webhook targets**: Workstacean GitHub plugin (`POST /webhook/github`)
- **Bot comments**: `protoava[bot]` and `protoquinn[bot]` post review and triage comments

### Google Workspace (roadmap)

Calendar, email, and docs integration planned for the Google Workspace plugin in Workstacean. Will enable task intake from Gmail and scheduling context from Calendar. Config location: `workspace/plugins/google.yaml` (not yet implemented).

---

## Cloudflare Tunnel

Tunnels terminate in the homelab Docker network and forward to internal services. All public hostnames use HTTPS; internal traffic is plain HTTP.

| Public Hostname           | Internal Target         | Service                    |
| ------------------------- | ----------------------- | -------------------------- |
| `ava.protoLabs.studio`    | `automaker-server:3008` | protoMaker API + WebSocket |
| `chat.protoLabs.studio`   | `openwebui:3000`        | OpenWebUI chat interface   |
| `search.protoLabs.studio` | `searxng:8080`          | SearXNG metasearch         |
| `llm.protoLabs.studio`    | `litellm:4000`          | LiteLLM proxy              |

**Config lives in**: `homelab-iac/stacks/cloudflare/` (Cloudflare tunnel credentials in Infisical).

---

## Gateway Layer

### LiteLLM

Model routing proxy. Exposes a single `/v1/chat/completions` endpoint and routes to the correct backend (Anthropic, OpenAI, local vLLM) based on model alias.

- **Port**: `4000` (internal), exposed via Cloudflare at `llm.protoLabs.studio`
- **Auth**: API key validation. Keys stored in Infisical, mounted at startup.
- **Model aliases**: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001`, `gpt-4o`, local models via vLLM on ava node
- **Talks to**: Anthropic API (cloud), vLLM (local, ava node A6000)
- **Talked to by**: OpenWebUI, any agent that needs non-Anthropic models
- **Config lives in**: `homelab-iac/stacks/ai/litellm-config.yaml`

### MCP Server

Tool surface for Claude Code agents. Exposes ~159 tools organized by category (feature management, agent control, queue management, GitHub ops, observability).

- **Port**: `3009` (internal), consumed by Claude Code plugin
- **Talks to**: protoMaker API (`automaker-server:3008`)
- **Talked to by**: Claude Code agents via MCP protocol
- **Config lives in**: `packages/mcp-server/` in the `ava` repo

### OpenWebUI

Chat interface for direct LLM interaction. Backed by LiteLLM.

- **Port**: `3000` (internal), exposed via Cloudflare at `chat.protoLabs.studio`
- **Talks to**: LiteLLM (model proxy)
- **Talked to by**: Josh (human), any browser
- **Config lives in**: `homelab-iac/stacks/ai/docker-compose.yml`

### SearXNG

Privacy-respecting metasearch engine. Used by Researcher agent for deep research tasks.

- **Port**: `8080` (internal), exposed via Cloudflare at `search.protoLabs.studio`
- **Talks to**: Public search engines (proxied)
- **Talked to by**: Researcher agent, OpenWebUI (via tool)
- **Config lives in**: `homelab-iac/stacks/ai/searxng/`

---

## Orchestration Layer: Workstacean

Workstacean is the central orchestration backbone. It does three things:

1. **Route messages** from interface plugins to agents based on skill matching
2. **Serve the registry** so any service can discover agents and projects
3. **Mint correlationIds** that flow through every downstream artifact

It is NOT a Discord bot. Discord is one of several interface plugins connected to the bus.

### Bus Topics

| Topic            | Direction     | Purpose                                          |
| ---------------- | ------------- | ------------------------------------------------ |
| `agent.request`  | Plugin → Bus  | Incoming signal from any interface               |
| `agent.response` | Bus → Plugin  | Agent reply routed back to originating interface |
| `hitl.request`   | Bus → Plugin  | Human-in-the-loop prompt                         |
| `hitl.response`  | Plugin → Bus  | Human response to HITL prompt                    |
| `event.internal` | Service → Bus | Internal system events (webhooks, cron signals)  |

### Plugins

| Plugin               | Status  | Transport                         | Notes                                            |
| -------------------- | ------- | --------------------------------- | ------------------------------------------------ |
| **Discord**          | Active  | WebSocket (discord.js)            | Primary interface — embeds, threads, reactions   |
| **GitHub**           | Active  | Webhooks (`POST /webhook/github`) | Issue/PR events, bot comments                    |
| **A2A**              | Active  | HTTP JSON-RPC 2.0                 | Inter-agent communication                        |
| **Plane**            | Planned | Webhooks                          | Board-native intake                              |
| **Onboarding**       | Active  | Internal                          | Runs `/setuplab` pipeline on new project signals |
| **Google Workspace** | Roadmap | OAuth + API                       | Gmail intake, Calendar context                   |

### OnboardingPlugin Pipeline

When Workstacean receives a signal with `skillHint: "onboard_project"`, the OnboardingPlugin runs the 5-phase setup pipeline:

```
1. scan   — detect tech stack, dependencies, project structure
2. analyze — compare against quality standard (CI, types, testing, tooling)
3. initialize — create .automaker/ context files, register in projects.yaml
4. propose — create alignment features on the board
5. execute — launch auto-mode to implement alignment work
```

Config: `workspace/plugins/onboarding.yaml`

### Agent Registry (`workspace/agents.yaml`)

Single source of truth for all agent metadata: name, team, URL, skills, chain rules. Consumed by the A2A plugin at startup. Live skills from `/.well-known/agent.json` override static definitions if available.

### Project Registry (`workspace/projects.yaml`)

Single source of truth for all project metadata: team assignments, agent bindings, Discord channels, repo metadata. Used by the skill router to map repos → projects → routing rules.

### API Endpoints

| Endpoint        | Method | Description             |
| --------------- | ------ | ----------------------- |
| `/api/agents`   | GET    | Full agent registry     |
| `/api/projects` | GET    | Full project registry   |
| `/publish`      | POST   | Inject message onto bus |

### Deployment

Config in `homelab-iac/stacks/ai/docker-compose.yml`. Registry files mounted from `protoWorkstacean/workspace/`.

---

## Agent Layer

All A2A agents expose `/.well-known/agent.json` and accept JSON-RPC 2.0 `message/send` calls.

### Ava — Portfolio Orchestrator

- **A2A Endpoint**: `http://automaker-server:3008/a2a`
- **Team**: Dev (primary orchestrator across all teams)
- **Skills**: `plan`, `plan_resume`, `sitrep`, `manage_feature`, `auto_mode`, `board_health`, `onboard_project`
- **Projects served**: All — Ava is the single orchestration entry point
- **Activation**: Receives signals from Workstacean bus; also directly addressable via A2A
- **Config lives in**: `ava` repo, `.claude/commands/` for skill definitions

### Quinn — QA Engineer / Bug Triage

- **A2A Endpoint**: `http://quinn:7870/a2a`
- **Team**: Dev
- **Skills**: `bug_triage`, `pr_review`, `qa_report`, `board_audit`
- **Projects served**: All — routes via `#bug-reports` Discord channel workflow
- **Activation**: Workstacean routes GitHub issue events and `#bug-reports` signals directly to Quinn
- **Config lives in**: `homelab-iac/stacks/ai/quinn/`

### Frank — DevOps / Infrastructure

- **A2A Endpoint**: `http://frank:7880/a2a`
- **Team**: Dev
- **Skills**: `infra_health`, `deploy`, `monitoring`
- **Projects served**: All infrastructure — homelab, staging, production
- **Activation**: Workstacean routes `#infra` and deployment signals to Frank
- **Config lives in**: `homelab-iac/stacks/ai/frank/`

### Jon — GTM Strategy

- **A2A Endpoint**: internal (called by Ava as sub-agent)
- **Team**: GTM
- **Skills**: `market_review`, `positioning`, `antagonistic_review`
- **Projects served**: All — provides strategic lens during planning pipeline
- **Activation**: Ava calls Jon during antagonistic review in the `plan` skill
- **Config lives in**: `ava` repo, `.claude/commands/jon.md`

### Cindi — Content Execution

- **A2A Endpoint**: internal (called by Ava as sub-agent)
- **Team**: GTM
- **Skills**: `blog`, `seo`, `content_review`
- **Projects served**: protoLabs content pipeline, marketing, docs
- **Activation**: Ava calls Cindi for content tasks; also triggered by content pipeline flows
- **Config lives in**: `ava` repo, `.claude/commands/cindi.md`

### Researcher — Deep Research

- **A2A Endpoint**: internal (called by Ava or Quinn)
- **Team**: Knowledge
- **Skills**: `research`, `entity_extract`
- **Projects served**: Any — called when deep research is needed before planning or triage
- **Activation**: Ava or Quinn invoke Researcher before planning or complex triage
- **Config lives in**: `ava` repo, `.claude/commands/researcher.md`

---

## Dev Tooling: protoMaker / Automaker

The board engine and agent execution environment. Manages the full feature lifecycle from backlog to merged PR.

### Components

| Component               | Description                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **Board**               | Kanban-style feature tracker. Statuses: `backlog → in_progress → review → done / blocked` |
| **Auto-mode**           | Autonomous feature pickup loop. Processes features in dependency order.                   |
| **Worktrees**           | Isolated git worktrees per feature in `{projectPath}/.worktrees/{branch}`                 |
| **Lead Engineer**       | Production orchestrator. Fast-path rules (pure functions) for routine decisions.          |
| **PR Pipeline**         | Automated PR creation, CI check monitoring, CodeRabbit review, auto-merge                 |
| **Portfolio Scheduler** | Planned — roadmap integration with Plane for cross-project scheduling                     |

### Key Services

- `LeadEngineerService` — state machine + fast-path rules
- `AutoModeService` — feature pickup loop with concurrency control
- `GitWorkflowService` — worktree creation, PR management
- `FeatureLoader` — feature CRUD with status normalization

### Ports

- `3007` — UI (React, Vite)
- `3008` — API + WebSocket + A2A endpoint

### Config lives in

- `ava` repo (protoMaker on GitHub)
- `.automaker/` per managed project
- `data/settings.json` for global settings

---

## Strategic Layer: Plane

Project management for strategic work items. Plane is used for the human-visible project roadmap and cross-team coordination — not for auto-mode feature execution (that lives on the protoMaker board).

### Workspace Structure

| Identifier  | Description              |
| ----------- | ------------------------ |
| `protolabs` | Primary workspace        |
| `PROTO`     | Core platform features   |
| `GTM`       | Go-to-market initiatives |
| `INFRA`     | Infrastructure work      |

### Sync with Workstacean

`workspace/projects.yaml` is the single source of truth for project metadata. Plane project identifiers are stored in `projects.yaml` under `plane.projectId` so Workstacean can cross-reference board features with Plane issues.

**Direction**: Plane → Workstacean (via planned Plane plugin webhook). Bidirectional sync is a roadmap item.

---

## Observability Cross-Cut

All layers emit telemetry to the observability stack. No layer is exempt.

### Langfuse

LLM traces and cost tracking. Every agent turn is traced with `correlationId`, model, input/output tokens, and cost.

- **URL**: `https://cloud.langfuse.com` (cloud-hosted)
- **Talked to by**: All agents via `@protolabsai/observability` package
- **Key metrics**: Cost per feature, cost per project, total burn, trace success rate
- **Config**: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` in Infisical

### MLflow

Experiment tracking for model evaluation and flow optimization.

- **URL**: `http://mlflow:5000` (internal, homelab)
- **Talked to by**: Flow development, model evaluation scripts
- **Config lives in**: `homelab-iac/stacks/ai/docker-compose.yml`

### Prometheus + Grafana

Infrastructure and application metrics.

- **Prometheus**: `http://prometheus:9090` (internal)
- **Grafana**: `http://grafana:3001` (internal)
- **Key dashboards**: Agent concurrency, queue depth, PR pipeline throughput, infra health
- **Config lives in**: `homelab-iac/stacks/monitoring/`

### Infisical

Secrets management backbone. Every service that needs an API key or credential pulls from Infisical at startup.

- **URL**: `https://app.infisical.com` (cloud-hosted)
- **Talked to by**: All Docker Compose services via `infisical run --`
- **Managed secrets**: Anthropic API key, GitHub tokens, Discord tokens, Cloudflare credentials, LiteLLM keys, Langfuse keys
- **Config lives in**: `homelab-iac/stacks/` (each stack has an Infisical project ID)

---

## Infrastructure

### ava node

Primary compute node. Runs most homelab services.

- **GPU**: NVIDIA A6000 (48GB VRAM) — local LLM inference via vLLM
- **Storage**: 2 × 8TB (ZFS mirror)
- **OS**: Ubuntu 22.04 (bare metal, not Proxmox guest)
- **Key services**: protoMaker, Workstacean, Quinn, Frank, LiteLLM, OpenWebUI, SearXNG, MLflow, Prometheus, Grafana, MinIO

### protolabs node

High-VRAM inference node. Reserved for large model training and inference.

- **GPU**: 2 × RTX PRO 6000 Blackwell (192GB VRAM total)
- **Role**: Large model inference, fine-tuning, evaluation
- **Status**: Partially integrated — vLLM endpoints registered in LiteLLM

### pve01

Proxmox hypervisor. Runs VMs for isolated workloads.

- **Key VMs**: CI runners, isolated test environments
- **Config lives in**: `homelab-iac/pve01/`

### pi

Raspberry Pi running Home Assistant. Not part of the AI stack directly.

- **Role**: Home automation, ambient monitoring
- **Integration**: Planned (smart home signals as Workstacean events)

### MinIO

S3-compatible object storage. Shared across all services.

- **URL**: `http://minio:9000` (internal)
- **Buckets**: `agent-outputs`, `langfuse-exports`, `mlflow-artifacts`, `media`
- **Config lives in**: `homelab-iac/stacks/storage/`

### Tailscale (MagicDNS)

Zero-config mesh VPN. All nodes and services are reachable by MagicDNS names (`ava-node.tail…`, `pve01.tail…`).

- **Role**: Secure inter-node communication without port forwarding
- **Config**: Each node runs `tailscaled`; auth keys in Infisical

### cupcake.usbx.me

Remote seedbox. Handles media and large file transfers.

- **Role**: External storage relay for large artifacts (model weights, dataset exports)
- **Access**: rclone + SSH, credentials in Infisical

---

## Architecture Boundaries

Three repos, three responsibilities. No overlap.

| Boundary                 | Repo               | Owns                                                                                                            |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Deployment**           | `homelab-iac`      | Docker Compose, volume mounts, env vars, network config, port mappings                                          |
| **Bus + Registry**       | `protoWorkstacean` | Message routing, skill matching, interface plugins, `agents.yaml`, `projects.yaml`, correlationId minting       |
| **Planning + Execution** | `ava` (protoMaker) | Planning pipeline, PRD generation, antagonistic review, board management, Lead Engineer, auto-mode, PR pipeline |

### What each repo does NOT own

- `homelab-iac` — no agent logic, no skill definitions, no routing rules
- `protoWorkstacean` — no plan execution, no board state, no agent runs
- `ava` — no agent registry (reads from Workstacean API), no project registry, no message routing
