# protoLabs Fleet Architecture

## Agent Fleet

Six agents organized into three teams. All A2A agents expose `/.well-known/agent.json` and accept JSON-RPC 2.0 `message/send` calls.

| Agent          | Team      | Role                                                             | A2A Endpoint                       | Key Skills                                                                                        |
| -------------- | --------- | ---------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Ava**        | Dev       | Chief of Staff — planning, orchestration, board management       | `http://automaker-server:3008/a2a` | `plan`, `plan_resume`, `sitrep`, `manage_feature`, `auto_mode`, `board_health`, `onboard_project` |
| **Quinn**      | Dev       | QA Engineer — triage, review, audits                             | `http://quinn:7870/a2a`            | `bug_triage`, `pr_review`, `qa_report`, `board_audit`                                             |
| **Frank**      | Dev       | DevOps — infrastructure, deploys, monitoring                     | `http://frank:7880/a2a`            | `infra_health`, `deploy`, `monitoring`                                                            |
| **Jon**        | GTM       | Strategy — market positioning, ROI analysis, antagonistic review | internal (called by Ava)           | `market_review`, `positioning`, `antagonistic_review`                                             |
| **Cindi**      | GTM       | Content — blog posts, technical docs, SEO                        | internal (called by Ava)           | `blog`, `seo`, `content_review`                                                                   |
| **Researcher** | Knowledge | Deep research — entity extraction, knowledge graph               | internal (called by Ava)           | `research`, `entity_extract`                                                                      |

### Team Boundaries

- **Dev team** (Ava, Quinn, Frank): A2A-addressable services with their own endpoints. Workstacean routes directly to them based on skill matching.
- **GTM team** (Jon, Cindi): Called by Ava as sub-agents during planning and content pipelines. Not directly addressable via the bus (yet).
- **Knowledge** (Researcher): Called by Ava or Quinn when deep research is needed before planning or triage.

## Workstacean -- The Shared Spine

protoWorkstacean is the central message bus and registry service. It has three jobs:

1. **Route messages** from interface plugins to the correct agent based on skill matching
2. **Serve the registry** so any service can discover agents and projects
3. **Mint correlationIds** that flow through every downstream artifact

### Registry Files

Both files live in the protoWorkstacean repo under `workspace/`:

- **`workspace/agents.yaml`** — authoritative agent registry. Defines name, team, URL, skills, and chain rules for every agent. Consumed by the A2A plugin at startup (live skills from `/.well-known/agent.json` override if available).
- **`workspace/projects.yaml`** — authoritative project registry. Enriched schema: `team`, `agents`, Discord channels, repo metadata. Used by the skill router to map repos to projects to routing rules.

### API Endpoints

| Endpoint        | Method | Description                                                              |
| --------------- | ------ | ------------------------------------------------------------------------ |
| `/api/agents`   | GET    | Full agent registry — consumed by Quinn, protoMaker, and future services |
| `/api/projects` | GET    | Full project registry with enriched metadata                             |
| `/publish`      | POST   | External services (Ava, scripts, cron) inject messages onto the bus      |

### Deployment

homelab-iac `stacks/ai/docker-compose.yml` mounts the workspace directory:

```yaml
volumes:
  - /home/josh/dev/protoWorkstacean/workspace:/workspace
```

The Workstacean container reads `agents.yaml` and `projects.yaml` from `/workspace` at startup and watches for changes.

## Interface Plugin Contract

Any interface plugin can connect to the bus. The plugin contract has three responsibilities:

1. **Publish with metadata** — every message includes `source: { interface, channelId, userId }` and `reply: { topic, format }` so responses and HITL requests can route back to the originating surface
2. **Render HITLRequest** — when the bus delivers an `HITLRequest`, the plugin renders it using its native UX (Discord embed with buttons, voice prompt, Slack interactive message, etc.)
3. **Send HITLResponse** — when the human responds, the plugin publishes an `HITLResponse` back to the bus with the `correlationId`

### Interface Plugins

| Plugin  | Status  | Transport                            | Notes                                                               |
| ------- | ------- | ------------------------------------ | ------------------------------------------------------------------- |
| Discord | Active  | WebSocket (discord.js)               | Primary interface — embeds, threads, reactions, webhooks            |
| GitHub  | Active  | Webhooks (POST /webhook/github)      | Issue/PR events, bot comments via protoava[bot] and protoquinn[bot] |
| API     | Active  | HTTP (POST /publish)                 | Programmatic injection for scripts, cron, external services         |
| Voice   | Planned | WebSocket (Whisper STT + Kokoro TTS) | Voice-in/voice-out via gateway audio models                         |
| Plane   | Planned | Webhooks                             | Board-native interface for project management                       |
| Slack   | Planned | Slack Events API                     | Workspace integration                                               |

### Key Principle

**The bus is dumb.** Interface plugins own rendering. Ava owns plan state. `correlationId` is the spine. Adding a new interface (e.g., Slack) requires only implementing the three plugin responsibilities above -- no changes to Ava, the bus, or any other plugin.

## CorrelationId Lineage

Every signal that enters the system gets a `correlationId` minted by Workstacean at intake. This ID is the spine that connects every artifact produced from that signal, enabling end-to-end traceability from idea to shipped code.

### Where It Lives

| Artifact               | Location                                                  |
| ---------------------- | --------------------------------------------------------- |
| Bus message            | `message.correlationId` -- minted at intake               |
| SPARC PRD              | `prd.metadata.correlationId`                              |
| Board project          | `project.metadata.correlationId`                          |
| Board features         | `feature.metadata.correlationId` (inherited from project) |
| Pull requests          | PR body watermark (`<!-- correlationId: <id> -->`)        |
| Langfuse traces        | `trace.metadata.correlationId`                            |
| HITLRequest            | `hitlRequest.correlationId`                               |
| HITLResponse           | `hitlResponse.correlationId`                              |
| SQLite plan checkpoint | `plans.db` row keyed by `correlationId`                   |

### Traceability

Given any artifact, you can trace the full lineage:

```
PR #142 → feature board-audit-v2 → project protoLabs-qa → PRD sparc-qa-2026-04
  → HITL approval (Josh, Discord, 2026-04-05T22:30:00Z)
    → antagonistic review (Ava: 4.2, Jon: 3.8 → HITL triggered)
      → bus message (Discord, #ideas, Josh)
        → correlationId: ws-a1b2c3d4
```

## Planning Pipeline

### Full Flow

```
1. Idea arrives via any interface plugin
   → Interface plugin publishes to bus with source + reply metadata
   → Workstacean mints correlationId

2. Workstacean routes to Ava (skillHint: "plan")
   → Ava: generate SPARC PRD
   → Ava: Antagonistic Review
       - Ava lens: operational feasibility, capacity, technical risk
       - Jon lens: customer value, market positioning, ROI

3a. AUTO-APPROVED (both Ava + Jon score > 4.0)
    → Create project on board
    → Decompose into features
    → Stamp correlationId on project + all features
    → Launch project → Lead Engineer takes over

3b. HITL NEEDED (either score <= 4.0)
    → Ava publishes HITLRequest to reply.topic (back to originating interface)
    → A2A returns immediately: { status: "pending_approval", correlationId }
    → Interface plugin renders natively (Discord embed / voice prompt / etc.)
    → Human responds (approve / reject / request changes)
    → HITLResponse published on bus with correlationId
    → Workstacean routes to Ava (skillHint: "plan_resume")
    → Ava restores plan state from SQLite checkpoint
    → If approved: create project + features, stamp correlationId, launch
    → If rejected: log decision, notify originator, archive PRD
```

### Plan State Persistence

- **Storage**: SQLite `plans.db` in Ava's data directory
- **Key**: `correlationId`
- **Contents**: PRD, antagonistic review scores, feature decomposition, originator metadata
- **TTL**: 7 days -- unapproved plans are garbage-collected after one week
- **Restore**: `plan_resume` skill loads the checkpoint by `correlationId` and continues from where the pipeline paused

### Antagonistic Review: A Core Principle

The Ava/Jon antagonistic relationship is not just a feature -- it's a core organizational principle. Every idea from the operator flows through two lenses:

- **Ava (operational)**: Can we build this? Do we have capacity? What breaks if we do?
- **Jon (strategic)**: Should we build this? Does the market want it? What's the ROI?

This dual-lens review prevents confirmation bias. Ava alone would build everything Josh asks for. Jon alone would only build what sells. Together, they produce plans that are both feasible and valuable.

## Architecture Boundaries

Three repos, three responsibilities. No overlap.

| Boundary                 | Repo               | Owns                                                                                                                                                                                                                          |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deployment**           | `homelab-iac`      | Docker Compose files, volume mounts, environment variables, network configuration, port mappings. No business logic.                                                                                                          |
| **Bus + Registry**       | `protoWorkstacean` | Message routing, skill matching, interface plugins, `workspace/agents.yaml`, `workspace/projects.yaml`, `GET /api/*` endpoints, `POST /publish`, HITL gate routing, correlationId minting.                                    |
| **Planning + Execution** | `ava` (protoMaker) | Planning pipeline (`plan`/`plan_resume` skills), SPARC PRD generation, antagonistic review orchestration, board management, Lead Engineer, auto-mode, agent execution, PR pipeline, reflection loop, SQLite plan checkpoints. |

### What Each Repo Does NOT Own

- **homelab-iac** does not contain agent logic, skill definitions, or routing rules
- **protoWorkstacean** does not execute plans, manage board state, or run agents
- **ava** does not define the agent registry or project registry (reads from Workstacean API), and does not handle message routing (publishes/subscribes via bus)
