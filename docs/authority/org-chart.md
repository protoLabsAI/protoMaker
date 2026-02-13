# Authority System - Organization Chart & Permissions

## Overview

The authority system implements a trust-gated hierarchy where AI agents govern work through policy checks. Every agent action passes through `checkPolicy()` before execution.

The system has three layers:

1. **Types** (`libs/types/src/policy.ts`, `authority.ts`) - Pure type definitions
2. **Policy Engine** (`libs/policy-engine/`) - Stateless `checkPolicy()` function
3. **Authority Service** (`apps/server/src/services/authority-service.ts`) - Orchestrates agents, approval queue, events

## Organization Chart

```
Project Owner (Trust=3, Autonomous)
 |  Technical architecture, product vision, final authority
 |
 |-- Chief of Staff (Trust=2, Conditional) — Orchestrator
 |    Operational leader, product direction, team expansion
 |    |
 |    |-- Crew Loop Members (scheduled, auto-escalate)
 |    |    |
 |    |    |-- PR Maintainer (Haiku, every 10 min)
 |    |    |    Stale PRs, auto-merge, thread resolution
 |    |    |
 |    |    |-- Board Janitor (Haiku, every 15 min)
 |    |    |    Board consistency, orphaned features, dep chains
 |    |    |
 |    |    |-- DevOps Engineer (Sonnet, every 10 min)
 |    |         Infrastructure, deployment, monitoring, staging
 |    |
 |    |-- Interactive Agents (CLI + Discord accessible)
 |    |    |
 |    |    |-- Frontend Engineer (Sonnet, Trust=2)
 |    |    |    UI components, design system, Tailwind, a11y
 |    |    |
 |    |    |-- GTM Specialist (Sonnet, Trust=2)
 |    |         Content pipeline, brand strategy, growth
 |    |
 |    |-- Implementation Agents (auto-mode assigned)
 |    |    |
 |    |    |-- Backend Engineer (Sonnet)
 |    |    |-- QA Engineer (Sonnet)
 |    |    |-- Documentation Engineer (Haiku)
 |    |    |-- Product Manager (Sonnet)
 |    |    |-- Engineering Manager (Sonnet)
 |    |
 |    |-- Authority Agents (dormant — event-driven)
 |         |
 |         |-- PM Agent — idea research pipeline
 |         |-- ProjM Agent — project decomposition
 |         |-- EM Agent — work assignment
 |         |-- Principal Engineer — architecture review
```

## Roles

| Role                | Code     | Trust           | Owns                   | Description                                                                                         |
| ------------------- | -------- | --------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| GTM Specialist      | `GTM`    | 2 (Conditional) | Growth & Go-to-Market  | Top-level orchestrator. Content pipeline, brand strategy, external outreach.                        |
| Project Owner       | `CTO`    | 3 (Autonomous)  | Strategy & direction   | **The human user.** Full access to all actions. Sets vision, approves proposals, sets trust levels. |
| Chief of Staff      | `CoS`    | 2 (Conditional) | Operations & alignment | AI operational leader. Product direction, audit, team expansion, context continuity.                |
| DevOps Engineer     | `DevOps` | 1 (Assisted)    | Infrastructure         | Deployment, monitoring, staging, Docker, CI/CD, system health.                                      |
| Product Manager     | `PM`     | 1 (Assisted)    | What & Why             | Researches ideas, creates PRDs, defines scope. Creates work and manages scope changes.              |
| Project Manager     | `ProjM`  | 1 (Assisted)    | When & How             | Decomposes epics into tasks, manages dependencies, assigns work.                                    |
| Engineering Manager | `EM`     | 1 (Assisted)    | Who & Capacity         | Assigns engineers, manages capacity/WIP limits, quality gates.                                      |
| Principal Engineer  | `PE`     | 2 (Conditional) | Architecture & Quality | Reviews architecture decisions, approves work, blocks releases for quality.                         |

## Trust Levels

| Level | Name        | Meaning                                                | Max Risk |
| ----- | ----------- | ------------------------------------------------------ | -------- |
| 0     | Manual      | Every action requires human approval                   | `low`    |
| 1     | Assisted    | Low-risk actions auto-approved, medium+ needs approval | `low`    |
| 2     | Conditional | Low and medium risk auto-approved, high needs approval | `medium` |
| 3     | Autonomous  | All actions auto-approved up to high risk              | `high`   |

Trust evolves over time based on performance:

- Successful actions increase trust score
- Escalations and failures decrease trust score
- Score crossing threshold promotes trust level (1->2, 2->3)
- The project owner can manually set trust level via API

## Risk Levels

| Level      | Value | Description                             |
| ---------- | ----- | --------------------------------------- |
| `low`      | 0     | Minimal impact, easily reversible       |
| `medium`   | 1     | Moderate impact, some effort to reverse |
| `high`     | 2     | Significant impact, hard to reverse     |
| `critical` | 3     | Owner-only, potentially irreversible    |

## Permission Matrix

### Actions by Role

| Action                | Owner | GTM | CoS | DevOps | PM  | ProjM | EM  | PE  |
| --------------------- | ----- | --- | --- | ------ | --- | ----- | --- | --- |
| `create_work`         | Y     | Y   | Y   | -      | Y   | Y     | -   | -   |
| `assign`              | Y     | -   | Y   | -      | -   | Y     | Y   | -   |
| `change_scope`        | Y     | Y   | Y   | -      | Y   | -     | -   | -   |
| `block_release`       | Y     | -   | Y   | Y      | -   | -     | Y   | Y   |
| `modify_architecture` | Y     | -   | -   | -      | -   | -     | -   | Y   |
| `approve_work`        | Y     | -   | Y   | -      | -   | -     | -   | Y   |

### Max Risk Without Approval

| Role           | Max Risk               |
| -------------- | ---------------------- |
| Owner          | `critical` (unlimited) |
| GTM Specialist | `medium`               |
| Chief of Staff | `high`                 |
| DevOps         | `medium`               |
| PM             | `medium`               |
| ProjM          | `medium`               |
| EM             | `high`                 |
| PE             | `high`                 |

### Extended Actions (Authority Layer)

These actions exist in `PolicyActionType` for the authority service but are mapped to engine actions for policy checks:

| Authority Action      | Engine Mapping        | Description                          |
| --------------------- | --------------------- | ------------------------------------ |
| `create_work`         | `create_work`         | Create features, epics, tasks        |
| `assign_work`         | `assign`              | Assign work to agents/roles          |
| `change_scope`        | `change_scope`        | Modify feature scope or requirements |
| `change_estimate`     | `change_scope`        | Change effort estimates              |
| `block_release`       | `block_release`       | Block a release for quality/issues   |
| `escalate`            | `create_work`         | Escalate an issue up the chain       |
| `transition_status`   | `assign`              | Move feature between statuses        |
| `approve_work`        | `approve_work`        | Approve completed work               |
| `delegate`            | `assign`              | Delegate task to another agent       |
| `modify_architecture` | `modify_architecture` | Change system architecture           |
| `update_status`       | `assign`              | Update work item status              |
| `create_pr`           | `create_work`         | Create a pull request                |
| `merge_pr`            | `approve_work`        | Merge a pull request                 |

## Status Transitions

### Workflow States

```
backlog -> in_progress -> review -> done
             |    ^         |
             v    |         v
           blocked -------> backlog
```

### Transition Guards

| From          | To            | Allowed Roles         | Notes                                 |
| ------------- | ------------- | --------------------- | ------------------------------------- |
| `backlog`     | `in_progress` | Owner, CoS, ProjM, EM | Starting work                         |
| `in_progress` | `review`      | Owner, CoS, PE, EM    | Submitting for review                 |
| `review`      | `done`        | Owner, CoS, PE        | Requires approval above `medium` risk |
| `in_progress` | `blocked`     | Owner, CoS, EM, PE    | Blocking work                         |
| `review`      | `blocked`     | Owner, CoS, EM, PE    | Blocking reviewed work                |
| `blocked`     | `in_progress` | Owner, CoS, EM, PE    | Unblocking work                       |
| `in_progress` | `backlog`     | All roles             | Moving back to backlog                |
| `review`      | `backlog`     | All roles             | Moving back to backlog                |

### Work Item States (Extended)

The authority system uses an extended set of work item states that map to feature statuses:

| Work State    | Description                     | Key Transitions    |
| ------------- | ------------------------------- | ------------------ |
| `idea`        | Raw idea, not yet researched    | PM picks up        |
| `research`    | Being researched by PM          | PM creates PRD     |
| `planned`     | PRD created, epic defined       | ProjM decomposes   |
| `ready`       | Tasks defined, dependencies set | EM assigns         |
| `in_progress` | Being implemented               | Auto-mode executes |
| `blocked`     | Blocked by issue/dependency     | ProjM/EM resolves  |
| `testing`     | Under testing/verification      | EM validates       |
| `done`        | Completed and verified          | -                  |

## Policy Check Flow

```
Agent proposes action
     |
     v
[1] Permission Matrix Check
     "Does this role have this action?"
     |
     No -> DENY
     |
     Yes
     v
[2] Status Transition Check
     "Can this role make this transition?"
     |
     No -> DENY
     |
     Yes
     v
[3] Risk Gating Check
     "Does action risk exceed agent's max risk?"
     |
     Yes -> REQUIRE_APPROVAL (queued for human/owner)
     |
     No
     v
     "Does action risk exceed per-action limit?"
     |
     Yes -> REQUIRE_APPROVAL
     |
     No
     v
     "Does transition require approval above threshold?"
     |
     Yes -> REQUIRE_APPROVAL
     |
     No
     v
     ALLOW
```

## Delegation Rules

Agents can delegate work to others based on direction:

| Direction | Meaning                 | Example               |
| --------- | ----------------------- | --------------------- |
| `down`    | Delegate to subordinate | PM -> Task Decomposer |
| `up`      | Escalate to supervisor  | EM -> Owner           |
| `lateral` | Peer-to-peer handoff    | PM -> ProjM           |

## API Endpoints

All endpoints require authentication.

| Method | Path                          | Description                    |
| ------ | ----------------------------- | ------------------------------ |
| GET    | `/api/authority/status`       | Authority system status        |
| POST   | `/api/authority/register`     | Register new authority agent   |
| POST   | `/api/authority/propose`      | Submit action proposal         |
| POST   | `/api/authority/resolve`      | Approve/reject/modify proposal |
| POST   | `/api/authority/approvals`    | List pending approvals         |
| POST   | `/api/authority/agents`       | List authority agents          |
| POST   | `/api/authority/trust`        | Get/set trust profiles         |
| POST   | `/api/authority/inject-idea`  | Owner submits feature idea     |
| POST   | `/api/authority/dashboard`    | Owner system overview          |
| POST   | `/api/authority/audit`        | Query audit trail              |
| POST   | `/api/authority/trust-scores` | View agent trust scores        |

## Configuration

Authority system is configured per-project in `.automaker/settings.json`:

```json
{
  "authoritySystem": {
    "enabled": true,
    "policyConfig": {
      "permissions": [...],
      "transitions": [...],
      "defaultTrustLevel": 1,
      "defaultMaxRisk": "low",
      "escalationThreshold": "high"
    }
  }
}
```

When `authoritySystem.enabled` is `false` (default), all features work exactly as before with no policy checks.

## Events

The authority system emits these events via WebSocket:

### Authority Events

| Event                             | Payload                                     | When                    |
| --------------------------------- | ------------------------------------------- | ----------------------- |
| `authority:proposal-submitted`    | `{ proposalId, agentId, action, target }`   | Proposal received       |
| `authority:approved`              | `{ agentId, action, auto }`                 | Action approved         |
| `authority:rejected`              | `{ agentId, action, reason }`               | Action rejected         |
| `authority:awaiting-approval`     | `{ requestId, agentId, action, target }`    | Queued for human review |
| `authority:agent-registered`      | `{ agentId, role, trustLevel }`             | Agent registered        |
| `authority:trust-updated`         | `{ agentId, oldTrustLevel, newTrustLevel }` | Trust level changed     |
| `authority:idea-injected`         | `{ projectPath, featureId, title }`         | Owner submitted idea    |
| `authority:pm-research-started`   | `{ projectPath, featureId, agentId }`       | PM began research       |
| `authority:pm-research-completed` | `{ projectPath, featureId, analysis }`      | PM finished research    |
| `authority:pm-epic-created`       | `{ epicId, title, childCount }`             | PM created epic         |

### PR Feedback Events

| Event                          | Payload                                   | When                     |
| ------------------------------ | ----------------------------------------- | ------------------------ |
| `pr:feedback-received`         | `{ featureId, prNumber, type }`           | Any PR review activity   |
| `pr:changes-requested`         | `{ featureId, prNumber, feedback }`       | Reviewer requested fixes |
| `pr:approved`                  | `{ featureId, prNumber, approvers }`      | PR approved              |
| `feature:reassigned-for-fixes` | `{ featureId, prNumber, iterationCount }` | EM sent back for fixes   |
| `feature:worktree-cleaned`     | `{ featureId, branchName }`               | Worktree auto-removed    |
| `feature:pr-merged`            | `{ featureId, prNumber, branchName }`     | PR merged via webhook    |

## File Locations

| File                                                                   | Purpose                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| `libs/types/src/policy.ts`                                             | All policy and trust type definitions              |
| `libs/types/src/authority.ts`                                          | Authority agent and work item types                |
| `libs/policy-engine/src/engine.ts`                                     | Core `checkPolicy()` function                      |
| `libs/policy-engine/src/defaults.ts`                                   | Default permission matrix and transitions          |
| `libs/policy-engine/tests/engine.test.ts`                              | Unit tests for policy engine                       |
| `apps/server/src/services/authority-service.ts`                        | Authority service (registry, proposals, approvals) |
| `apps/server/src/routes/authority/index.ts`                            | REST API routes                                    |
| `apps/server/src/services/authority-agents/pm-agent.ts`                | PM agent (idea research + PRD + epics)             |
| `apps/server/src/services/authority-agents/projm-agent.ts`             | ProjM agent (epic decomposition + deps)            |
| `apps/server/src/services/authority-agents/em-agent.ts`                | EM agent (assignment + capacity + PR feedback)     |
| `apps/server/src/services/authority-agents/status-agent.ts`            | Status agent (blocker detection + escalation)      |
| `apps/server/src/services/authority-agents/discord-approval-router.ts` | Discord approval notifications                     |
| `apps/server/src/services/audit-service.ts`                            | Append-only JSONL audit trail                      |
| `apps/server/src/services/pr-feedback-service.ts`                      | GitHub PR review monitoring                        |
| `apps/server/src/services/worktree-lifecycle-service.ts`               | Auto-cleanup on merge/complete                     |

## Persistence

Per-project authority data stored in `.automaker/authority/`:

| File                  | Contents                       |
| --------------------- | ------------------------------ |
| `agents.json`         | Registered authority agents    |
| `trust-profiles.json` | Trust profiles with stats      |
| `approval-queue.json` | Pending and resolved approvals |
| `audit.jsonl`         | Append-only audit trail        |
