---
name: beads-workflow
emoji: 📿
description: Beads-first operational work loop. How to use Beads as primary work queue for all work streams (code, GTM, content, customer success, infra).
metadata:
  author: agent
  created: 2026-02-12T02:11:33.248Z
  usageCount: 0
  successRate: 0
  tags: [beads, workflow, operations, task-management, autonomous]
  source: learned
---

# Beads-First Work Loop

Beads (`bd` CLI) is Ava's operational brain. The Automaker board is ONE execution surface — Beads manages ALL work streams.

## Core Loop

```
1. bd ready              → What's unblocked?
2. Pick highest priority → P0 first, then P1, P2, etc.
3. bd update <id> --claim → Claim it
4. Execute:
   - Code work → Create Automaker board feature, start agent
   - Ops work → Direct action (fix config, resolve PR, update docs)
   - Strategic work → Research + plan + create sub-tasks
   - GTM/Content → Draft, review, publish via appropriate tools
5. bd close <id>         → Mark complete with reason
6. bd ready              → Next item
```

## Categories

| Category | Use For | Execution Surface |
|----------|---------|-------------------|
| `bug` | Code bugs, regressions | Automaker board → agent |
| `improvement` | Code enhancements | Automaker board → agent |
| `task` | One-off operational tasks | Direct action or agent |
| `strategic` | Planning, architecture | Research → PRD → project |
| `gtm` | Go-to-market tasks | Content tools, Discord |
| `content` | Social media, docs, tutorials | Write tools, publish |
| `customer` | Support, success, feedback | Discord, email |
| `infra` | DevOps, staging, CI/CD | Bash, server management |
| `automation` | Self-improvement, hooks, skills | Code + config changes |

## Signal Detection → Bead Creation

When you discover work during monitoring, create a bead immediately:

```bash
# Bug found during monitoring
bd create "Fix: description" -p 1 -l bug

# Strategic opportunity from Linear
bd create "Evaluate: description" -p 2 -l strategic

# Automation opportunity (doing something manually twice)
bd create "Automate: description" -p 2 -l automation

# Customer need from Discord
bd create "Customer: description" -p 2 -l customer
```

## Priority Rules

- **P0**: Blocking production, data loss risk, security issue
- **P1**: Blocking other work, impacting users, Josh-requested
- **P2**: Important but not blocking, improvements, strategic
- **P3**: Nice-to-have, cleanup, exploration

## Separation from Automaker Board

| Beads | Automaker Board |
|-------|-----------------|
| Ava's operational brain | Dev execution layer |
| ALL work streams | Code features only |
| Manual or agent execution | Always agent execution |
| `bd` CLI | MCP tools / UI |
| `.beads/issues.jsonl` | `.automaker/features/` |

**Never mix**: Don't track Beads tasks on the Automaker board. Don't track Automaker features in Beads. They serve different altitudes.

## Before Signing Off

```bash
bd sync          # Sync state
bd ready         # Verify nothing critical left
# Update MEMORY.md with completed work
```
