---
name: world-state-check
emoji: 🌍
description: Quick situational awareness procedure for Ava. Use at session start, after returning from idle, or when unsure of current board state. Trigger on "what is the status", "check board", "situational awareness", "what needs attention", or "check current state".
metadata:
  author: agent
  created: 2026-02-12T02:11:51.978Z
  usageCount: 0
  successRate: 0
  tags: [monitoring, world-state, situational-awareness, checklist]
  source: learned
---

# World State Check

Fast situational awareness procedure. Run on every activation and periodically during long sessions.

## Quick Check (30 seconds)

```bash
# 1. Board state
mcp: get_board_summary → backlog/in-progress/review/done counts

# 2. Running agents
mcp: list_running_agents → any stuck or crashed?

# 3. Auto-mode
mcp: get_auto_mode_status → running? should it be?

# 4. Open PRs
gh pr list --state open --json number,title,statusCheckRollup,autoMergeRequest
```

## Decision Matrix

| Signal                            | Condition           | Action                                    |
| --------------------------------- | ------------------- | ----------------------------------------- |
| Feature in review + PR merged     | Status drift        | `move_feature` → done                     |
| Feature in_progress + no agent    | Orphaned            | Reset to backlog                          |
| PR checks passing + no auto-merge | Stuck pipeline      | `gh pr merge <n> --auto --squash`         |
| PR with unresolved threads        | CodeRabbit blocking | `resolve_review_threads` or GraphQL batch |
| PR format failure                 | Agent output dirty  | Format from inside worktree, commit, push |
| PR build failure                  | TypeScript error    | Diagnose, fix, push                       |
| PR behind main                    | Stale branch        | Update branch                             |
| Agent stuck > 30 min              | Hung agent          | Stop and reset feature                    |
| Auto-mode stopped + backlog > 0   | Idle capacity       | Start auto-mode                           |
| Types PR just merged              | Stale dist risk     | `npm run build:packages`                  |

## Deep Check (2 minutes, periodic)

```bash
# 6. Worktree health
mcp: list_worktrees → stale? uncommitted changes?

# 7. Dependency chain
mcp: get_execution_order + get_dependency_graph → missing deps?

# 8. Notifications
mcp: list_notifications → unread?

# 9. Briefing
mcp: get_briefing → critical events since last check?

# 10. Metrics pulse
mcp: get_project_metrics → cost trending? success rate?
mcp: get_capacity_metrics → utilization?
```

## Monitoring Cadence

| Check       | Frequency        | When                       |
| ----------- | ---------------- | -------------------------- |
| Quick check | Every activation | Always first               |
| Deep check  | Every 30 min     | During long sessions       |
| Full audit  | Daily            | Start of day / new session |

## Red Flags (Immediate Action)

- **Agent crash loop**: 2+ failures on same feature → escalate to opus or manual fix
- **Server OOM**: 95%+ heap → stop agents, reduce concurrency
- **Feature data missing**: `.automaker/features/` empty → check git status, restore from backup
- **CI broken on main**: Format/build failure → fix immediately, blocks all PRs
- **Cost spike**: > $10/hour → check for runaway agents, reduce concurrency
