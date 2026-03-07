# Instance State Architecture

How protoLabs manages state across instances, and why each machine starts fresh.

## Core Principle: Fresh State Per Instance

Every protoLabs instance — whether a dev laptop, staging VM, or production node in a hivemind mesh — starts with a **clean operational slate**. There is no inherited task queue, no stale project plans, no accumulated operational debt from another machine's history.

This is intentional. An instance's operational state is ephemeral. Its _knowledge_ is persistent.

## What's Shared vs Instance-Local

```
                 GIT-TRACKED (shared across all instances)
┌─────────────────────────────────────────────────────────┐
│  .automaker/context/     Coding rules, CLAUDE.md        │
│  .automaker/memory/      Agent learning (gotchas,       │
│                          patterns, decisions)            │
│  .automaker/skills/      Reusable agent skill files     │
│  .automaker/spec.md      Project specification          │
│  Source code, docs, tests, CI config                    │
└─────────────────────────────────────────────────────────┘

              INSTANCE-LOCAL (never committed to git)
┌─────────────────────────────────────────────────────────┐
│  .automaker/features/    Board state (Kanban features)   │
│  .automaker/projects/    Project plans & milestones      │
│  .automaker/settings.json  Instance-specific config      │
│  .worktrees/             Agent execution worktrees       │
│  labs/                   Cloned client repositories       │
└─────────────────────────────────────────────────────────┘
```

### Why This Split?

**Shared knowledge** is the organizational brain — what patterns work, what gotchas to avoid, what the project spec says. This compounds across all instances. When one agent learns that "Express 5 rejects `/:param(*)` routes", every future instance benefits.

**Instance-local state** is the operational context — what features this machine is working on, what tasks are in its queue, what project plans it created. This is ephemeral by design:

- **Board state** is runtime-managed by the server. Git-tracking it caused data loss (Feb 10 incident).
- **Project plans** are created per engagement. A staging VM working on client A doesn't need client B's plans.
- **Settings** may differ per machine (API keys, concurrency limits, model preferences).

## The setupLab Onboarding Pipeline

When a new instance spins up against a repo, it doesn't inherit understanding — it **builds** it:

```
1. RESEARCH    →  Scan the repo: tech stack, frameworks, structure
2. ANALYZE     →  Compare against gold standard, identify gaps
3. REPORT      →  Generate branded HTML gap report
4. INITIALIZE  →  Create .automaker/ with tailored context files
5. PROPOSE     →  Generate alignment features for the board
6. EXECUTE     →  Agents implement alignment work
```

This is the `/setuplab` skill. It takes a git URL or local path and produces a fully contextualized protoLabs instance in minutes. The instance understands the codebase _because it researched it_, not because someone told it.

### Future: Onboarding Task Templates

setupLab will generate a default set of onboarding tasks that the system works through to build deep understanding:

- Codebase architecture scan → write spec.md
- Dependency graph analysis → understand build order
- Test coverage audit → identify gaps
- CI/CD pipeline review → verify automation
- Security posture check → flag vulnerabilities

These tasks produce the context files and memory entries that make all subsequent agent work more effective.

## Hivemind: Multi-Instance Mesh

The fresh-state model is foundational for **hivemind** — protoLabs's multi-instance architecture where several machines work together on the same codebase, each owning specific domains.

### Architecture Overview

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Instance A   │    │  Instance B   │    │  Instance C   │
│  Domain:      │    │  Domain:      │    │  Domain:      │
│  frontend/    │◄──►│  backend/     │◄──►│  infra/       │
│  6 agents     │    │  6 agents     │    │  4 agents     │
│  macOS dev    │    │  Linux VM     │    │  Linux VM     │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                    Shared git repo
                    Shared knowledge (.automaker/context, memory, skills)
                    Instance-local boards, projects
```

### Why Fresh State Enables This

1. **No state conflicts** — each instance has its own board, its own task queue. No distributed consensus needed for operational state.
2. **Domain isolation** — Instance A works on frontend features, Instance B on backend. Features route by domain, not by a shared pool.
3. **Independent scaling** — spin up a new VM, run setupLab, it joins the mesh. No migration of state from another instance.
4. **Crash resilience** — if Instance B dies, its operational state dies with it. The work (code, PRs) lives in git. Another instance can pick up where it left off by creating new features from the same project plan.

### Hivemind Phases

| Phase                        | What                                                       | State Implications                           | Status  |
| ---------------------------- | ---------------------------------------------------------- | -------------------------------------------- | ------- |
| **0. Interface Extraction**  | Extract FeatureStore + EventBus interfaces, add instanceId | Prepare types for multi-instance             | ✅ Done |
| **1. Instance Identity**     | Instance ID, peer discovery, heartbeat via CRDT sync       | Each instance announces itself               | ✅ Done |
| **2. CRDT Sync**             | WebSocket sync server/client, feature event propagation    | Feature updates propagate to all peers       | ✅ Done |
| **3. Work-Stealing**         | Cross-instance load balancing via request/offer/accept     | Idle instances pull work from busy peers     | ✅ Done |
| **4. Aggregated Visibility** | Unified dashboard across instances                         | Read-only aggregation, no shared write state | Planned |
| **5. Auto-Discovery**        | mDNS/Bonjour LAN + WAN coordination                        | Instances find each other automatically      | Planned |

### CRDT Sync (Phase 2)

The `CrdtSyncService` manages WebSocket-based synchronization between instances:

- **Primary instance** starts a WebSocket sync server on the configured port (default: 4444)
- **Worker instances** connect as clients and receive real-time event propagation
- **Heartbeat protocol** — Each instance broadcasts capacity metrics every 30s; peers with expired TTL (120s) are removed
- **Leader election** — If the primary becomes unreachable, workers elect a new leader automatically
- **Event types synced** — Feature updates, work-stealing messages, and settings changes propagate to all peers

Configuration via `proto.config.yaml`:

```yaml
hivemind:
  role: primary # or worker
  syncPort: 4444
  peers:
    - url: 'ws://192.168.1.10:4444'
```

### Work-Stealing Protocol (Phase 3)

`WorkStealingService` enables cross-instance load balancing. When an instance's feature backlog empties, it broadcasts a work request to peers. Busy peers respond with offers of stealable features. The requesting instance accepts an offer by updating `feature.assignedInstance` via the CRDT event bus, making the reassignment visible to all peers.

**Handshake lifecycle:**

```
idle instance  →  WORK_REQUEST  (broadcast via CRDT)
busy peers     →  WORK_OFFER    (broadcast via CRDT, filtered by strategy)
idle instance  →  WORK_ACCEPT   (broadcast via CRDT, clears offer)
feature:updated propagates assignedInstance change to all instances
```

**Configuration** in `proto.config.yaml`:

```yaml
workStealing:
  strategy: capacity # capacity | domain | manual
  stealMax: 3 # max features per steal
  offerTtlMs: 60000 # offer expiry (60s)
```

**Strategies:**

| Strategy   | Behavior                                                      |
| ---------- | ------------------------------------------------------------- |
| `capacity` | Offer the highest-priority backlog features (default)         |
| `domain`   | Only offer features matching the requesting instance's domain |
| `manual`   | Disable work-stealing entirely (no requests or offers sent)   |

**Features are stealable when:**

- Status is `backlog`, `pending`, or `ready`
- `feature.stealable !== false`
- Not already assigned to another instance
- Not claimed by an agent (`claimedBy` is null)

**Persistence:** Requests, offers, and accepts are written to `.automaker/assignments.json` with TTL timestamps. On reconnect, pending requests are replayed so missed offers are sent to peers who requested while this instance was down.

**Service:** `apps/server/src/services/work-stealing-service.ts`
**Integration:** Auto-mode emits `auto_mode:no_work` when its feature backlog empties; `WorkStealingService.requestWork()` is called automatically via `setWorkStealingService()`.

### What Stays Shared

Even in a hivemind mesh, the **knowledge layer** is shared via git:

- `.automaker/context/` — coding rules apply to all instances
- `.automaker/memory/` — agent learnings benefit everyone
- `.automaker/skills/` — reusable skills available everywhere
- `docs/`, `CLAUDE.md` — project documentation is universal

This is the key insight: **knowledge is shared, operations are local**. Git is the synchronization mechanism for knowledge. The hivemind mesh handles operational coordination.

## State Lifecycle

```
NEW INSTANCE
  │
  ├─ git clone → gets shared knowledge (context, memory, skills)
  │
  ├─ /setuplab → builds instance-specific understanding
  │              creates .automaker/features/, .automaker/projects/
  │
  ├─ OPERATING → board fills with features
  │              agents execute, PRs merge, knowledge updates pushed to git
  │
  ├─ HIVEMIND JOIN → CrdtSyncService connects to primary (or becomes primary)
  │                  WorkStealingService registers handlers, replays pending requests
  │                  idle instances pull work from busy peers automatically
  │
  └─ SHUTDOWN → operational state discarded
               knowledge updates already in git
               code changes already merged
               nothing lost
```

## Design Decisions

| Decision                          | Rationale                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `.automaker/projects/` gitignored | Project plans are created per-engagement. Multiple instances may create different plans for different work. |
| `.automaker/features/` gitignored | Server runtime manages feature state. Git-tracking caused the Feb 10 data loss incident.                    |
| `.automaker/memory/` git-tracked  | Agent learnings are organizational knowledge. Every instance should benefit from past discoveries.          |
| `.automaker/context/` git-tracked | Coding rules and project context are universal. All agents on all instances follow the same rules.          |
| `labs/` gitignored                | Cloned client repos are large and instance-specific. Each machine clones what it needs.                     |

## Implications for Deployment

### Single Developer (Current)

One machine, one instance. setupLab runs once. Board state is local. Knowledge pushed to git on commit.

### Staging + Dev (Near-term)

Two instances. Staging runs production workloads, dev is for testing. Each has its own board. Shared knowledge via git pull/push.

### Hivemind Mesh (Future)

N instances, each with domain ownership. Features route automatically. Knowledge shared via git. Operations coordinated via peer mesh protocol.

The architecture scales because the hard part (state synchronization) is solved by keeping operational state local and only sharing knowledge through git — a synchronization mechanism that already works.
