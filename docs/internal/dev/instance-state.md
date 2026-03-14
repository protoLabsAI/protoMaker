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

1. **No state conflicts** — each instance has its own board, its own task queue. No distributed consensus needed for feature state.
2. **Role-based routing** — Instance A (role: `frontend`) prefers UI work, Instance B (role: `backend`) prefers API work. Instances pull phases matching their role from shared project documents.
3. **Independent scaling** — spin up a new VM, run setupLab, it joins the mesh. No migration of state from another instance.
4. **Crash resilience** — if Instance B dies, its operational state dies with it. The work (code, PRs) lives in git. Stale phase claims are automatically reclaimed by other instances after timeout (default 30min).

### Hivemind Phases

| Phase                        | What                                                       | State Implications                           |
| ---------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| **0. Interface Extraction**  | Extract FeatureStore + EventBus interfaces, add instanceId | Prepare types for multi-instance             |
| **1. Instance Identity**     | Instance ID, peer discovery, heartbeat                     | Each instance announces itself               |
| **2. Domain Routing**        | `hivemind.yaml` maps paths → instances                     | Features auto-route to owning instance       |
| **3. Aggregated Visibility** | Unified dashboard across instances                         | Read-only aggregation, no shared write state |
| **4. Auto-Discovery**        | mDNS/Bonjour LAN + WAN coordination                        | Instances find each other automatically      |

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
  ├─ HIVEMIND JOIN → announces to mesh, receives domain assignment
  │                  gets routed features from other instances
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
