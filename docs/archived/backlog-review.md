# Automaker Backlog Review

**Date:** 2026-02-05
**Source:** PRO-7 (157 features from previous planning sessions)
**Purpose:** Consolidate, triage, and reorganize into projects/milestones

---

## Current State Assessment

The original 157-feature backlog was accumulated across multiple planning sessions. Many have since been implemented, are duplicated, or are obsolete given architectural changes. This document organizes the remaining relevant work.

### What's Already Done (remove from backlog)

| System                        | Status   | Key Files                                        |
| ----------------------------- | -------- | ------------------------------------------------ |
| Settings Infrastructure       | Complete | settings-service.ts, 9 route files, UI           |
| Scheduled Tasks/Cron          | Complete | scheduler-service.ts (827 LOC)                   |
| CodeRabbit Parser             | Complete | coderabbit-parser-service.ts                     |
| Graphite Integration          | Complete | graphite-service.ts, graphite-sync-scheduler.ts  |
| Health Monitor + Event Hooks  | Complete | health-monitor-service.ts, event-hook-service.ts |
| Ralph Loops (iterative retry) | Complete | ralph-loop-service.ts (30KB+)                    |
| Client Polling/WebSocket      | Complete | UI hooks + WS events                             |
| Discord Service Layer         | Complete | 23 features delivered                            |
| Foundation (Types/Settings)   | Complete | 23 features delivered                            |

### What's Obsolete (archive)

| Category                                                                  | Reason                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| Changesets POC (3 features)                                               | Abandoned approach, using semantic release instead |
| Semantic Release POC (3 features)                                         | POC complete, decisions made                       |
| Hub Server (3 features)                                                   | Architecture stayed single-server                  |
| Duplicate Epics ([Epic] Foundation x2, [Epic] Testing & Documentation x2) | Consolidation artifacts                            |

### What's Partially Done (needs gap analysis)

| System           | What Exists                                           | What's Missing                                     |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Auto-Merge       | merge-eligibility-service.ts, github-merge-service.ts | Webhook triggers, auto-merge on check completion   |
| Inbound Webhooks | GitHub PR merged handler, signature verification      | check_suite/check_run handlers, auto-merge trigger |
| Error Handling   | Error classification, recovery-service.ts             | Circuit breaker pattern, resource throttling       |
| Skills/Learning  | agent-discovery.ts, skills routes                     | Auto-skill creation from successful runs           |
| PR Readiness     | Merge eligibility checks, PR listing                  | Conflict detection, missing-PR scanning            |
| Agent Resume     | resume-feedback routes                                | Webhook-triggered resume on check completion       |

### What's Missing (new work needed)

| System        | Description                                     |
| ------------- | ----------------------------------------------- |
| Bug Reporting | No dedicated service for structured bug reports |

---

## Proposed Project Organization

### Project 1: Webhook & Auto-Merge Pipeline

**Goal:** Close the loop - when PRs pass checks, auto-merge them. When CodeRabbit reviews come in, auto-process them.
**Status:** PARTIAL - core services exist, integration glue missing

#### Milestone 1: Inbound Webhook Expansion

- Add `check_suite` and `check_run` webhook handlers
- Add `issue_comment` handler (for CodeRabbit detection - overlaps with CodeRabbit Pipeline project)
- Add `pull_request_review` handler
- Unified webhook event dispatch

#### Milestone 2: Auto-Merge Integration

- Wire merge-eligibility-service to webhook events
- Auto-trigger merge check when all CI passes
- Safety monitoring (branch protection, required reviews)
- Configurable merge strategy (squash/merge/rebase per project)

#### Milestone 3: Agent Resume via Webhooks

- Resume agent when check_run fails (give it the error context)
- Resume agent when CodeRabbit requests changes
- Exponential backoff on repeated failures

**Overlaps with:** CodeRabbit Integration Pipeline (PRO-8 through PRO-12)

---

### Project 2: CodeRabbit Integration Pipeline

**Goal:** Real-time CodeRabbit detection -> Discord notifications -> Linear issues -> Agent self-healing
**Status:** PLANNED (already in Linear as PRO-8 through PRO-12)

#### Milestone 1: Real-time Detection (PRO-8)

- Add issue_comment + pull_request_review webhook handlers
- Filter for coderabbitai[bot] sender
- Auto-trigger process-coderabbit-feedback

#### Milestone 2: Discord Notifications (PRO-9)

- Forward parsed reviews to Discord with severity-coded embeds
- Thread creation for multi-comment reviews

#### Milestone 3: Linear Auto-Creation (PRO-10)

- Map CodeRabbit severity to Linear priority
- Deduplication logic per PR/comment-ID

#### Milestone 4: Agent Feedback Loop (PRO-11)

- AutoModeService listens for coderabbit:feedback-processed
- Feed review as structured input to agent prompt
- Track resolution metrics

#### Milestone 5: Configuration (PRO-12)

- .coderabbit.yaml with request_changes_workflow
- Custom checks for Automaker patterns

**Note:** Phase 1 overlaps heavily with Webhook Pipeline Project. Could share milestone.

---

### Project 3: Resilience & Error Handling

**Goal:** Make the agent system more robust under concurrent load and failure conditions
**Status:** PARTIAL - classification exists, patterns missing

#### Milestone 1: Circuit Breaker

- Implement circuit breaker pattern for API calls (Anthropic, GitHub, etc.)
- Open/half-open/closed states with configurable thresholds
- Per-endpoint tracking

#### Milestone 2: Resource Management

- Connection pooling for external APIs
- Rate limit tracking and backoff
- Memory/CPU monitoring with auto-throttling

#### Milestone 3: Enhanced Error Recovery

- Structured error taxonomy (retryable vs fatal vs degraded)
- Auto-escalation paths (retry -> different model -> human)
- Error reporting dashboard

**Priority:** These were flagged as "Critical Fixes" in the original backlog (4 features, HIGH PRIORITY). Some may already be addressed by existing recovery-service.ts.

---

### Project 4: PR Lifecycle Automation

**Goal:** Proactively manage PRs - detect missing PRs, find conflicts, ensure readiness
**Status:** PARTIAL - checks exist, automation missing

#### Milestone 1: PR Readiness Scanner

- Scan completed features for missing PRs
- Detect merge conflicts proactively
- Extract and validate PR check statuses

#### Milestone 2: PR Dashboard

- UI view of all open PRs with status
- Conflict alerts and merge order suggestions
- Stale PR detection

---

### Project 5: Skills & Learning System

**Goal:** Agents learn from successful runs and create reusable skills
**Status:** PARTIAL - discovery exists, creation missing

#### Milestone 1: Skill Auto-Creation

- Extract patterns from successful agent runs
- Create AGENT.md skill files automatically
- Skill validation and testing

#### Milestone 2: Learning System

- Track what works per project type
- Build project-specific context from history
- Implement memory_learning event hook

**Priority:** Experimental/lower priority. Nice to have but not blocking anything.

---

### Project 6: Discord HITL (Human-in-the-Loop) Tool

**Goal:** Allow AI agents to request human input via Discord DM during execution
**Status:** APPROVED (already planned in .automaker/projects/)

#### Milestone 1: Core HITL Tool

- Discord DM send/poll mechanism
- Timeout handling with configurable defaults
- Claude Agent SDK tool definition

#### Milestone 2: Integration & Polish

- Auto-mode integration for unattended HITL
- Response caching and history
- Multi-channel support

---

## Features to Archive/Delete

These are confirmed obsolete or completed:

| Category                               | Count   | Reason                     |
| -------------------------------------- | ------- | -------------------------- |
| Changesets POC                         | 3       | Abandoned approach         |
| Semantic Release POC                   | 3       | POC decisions made         |
| Hub Server                             | 3       | Single-server architecture |
| Duplicate Foundation Epics             | 2       | Already consolidated       |
| Duplicate Testing Epics                | 2       | Already consolidated       |
| All "done" Discord/Foundation features | 23      | Already merged             |
| Settings Infrastructure epics          | ~9      | Fully implemented          |
| Scheduled Tasks epics                  | ~7      | Fully implemented          |
| Graphite epics                         | ~6      | Fully implemented          |
| Health Monitor/Event Hooks epics       | ~6      | Fully implemented          |
| Ralph Loops epics                      | ~6      | Fully implemented          |
| Client Polling                         | 2       | Fully implemented          |
| **Total to archive**                   | **~72** |                            |

## Features Remaining (estimated)

| Project                         | Est. Features         | Priority      |
| ------------------------------- | --------------------- | ------------- |
| Webhook & Auto-Merge Pipeline   | ~12                   | High          |
| CodeRabbit Integration Pipeline | 5 (already in Linear) | High          |
| Resilience & Error Handling     | ~8                    | High          |
| PR Lifecycle Automation         | ~5                    | Medium        |
| Skills & Learning System        | ~6                    | Low           |
| Discord HITL Tool               | 5 (already planned)   | Medium        |
| Uncategorized/TBD               | ~10                   | Review needed |
| **Total remaining**             | **~51**               |               |

---

## Recommended Action Plan

1. **Archive ~72 obsolete/completed features** from the backlog
2. **Merge overlapping work** - Webhook Pipeline + CodeRabbit Pipeline share Phase 1
3. **Prioritize:**
   - P1: Resilience & Error Handling (stability)
   - P1: Webhook & Auto-Merge Pipeline (closes the dev loop)
   - P2: CodeRabbit Integration Pipeline (already planned)
   - P2: PR Lifecycle Automation
   - P3: Discord HITL Tool
   - P4: Skills & Learning System
4. **Create Linear projects** for each approved project
5. **Set up cycles** - start with 2-week sprints

---

## Remote Branches (47 total, reference)

These branches correspond to features that were attempted. Many are stale/unmerged:

### Likely still relevant (partial work)

- `feature/critical-fixes-*` (4 branches) - Circuit breaker, HTTP connection, system enforcement, AbortController
- `feature/inbound-webhook-*` (2 branches) - Webhook infrastructure
- `feature/pr-readiness-*` (4 branches) - PR checks, conflicts, missing PRs
- `feature/proactive-automation-*` (4 branches) - Event hooks, scheduled tasks, health monitoring
- `feature/coderabbit-feedback-*` (1 branch) - Feature branch tracking

### Likely obsolete (already implemented differently)

- `feature/scheduled-task-*` (2 branches) - Scheduler already implemented
- `feature/settings-infrastruct-*` (2 branches) - Settings already complete
- `feature/foundation-settings-*` (2 branches) - Foundation already done
- `feature/graphite-*` (2 branches) - Graphite already integrated
- `feature/skills-*` (2 branches) - Basic skills infrastructure done
- `feature/channel-reorganizati-*` (3 branches) - Discord already done
- `feature/discord-service-*` (3 branches) - Discord already done
- `feature/event-integration-*` (3 branches) - Events already done
- `feature/project-lifecycle-*` (3 branches) - Project lifecycle done
- `feature/ui-settings-*` (3 branches) - UI settings done

### Unclear

- `feat/scheduled-task-types` - May have useful type definitions
- `feature/agent-skill-prompts` - May have useful prompt templates
- `feature/auto-merge-execution-*` - Check if merge service already covers this
- `feature/codebase-cleanup-implement-stale` - One-time cleanup, may be done
- `feature/task-registration-*` - Check against scheduler implementation
