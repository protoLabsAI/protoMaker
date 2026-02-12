---
name: zombie-agent-recovery
emoji: 🧟
description: How to handle zombie agents stuck in restart loops. Covers the three independent retry mechanisms and why force-stopping makes it worse.
metadata:
  author: agent
  created: 2026-02-12T16:55:24.040Z
  usageCount: 0
  successRate: 0
  tags: [agent, auto-mode, recovery, troubleshooting, critical]
  source: learned
---

# Zombie Agent Recovery

When `stop_agent` is called, the server treats it as a failure — triggering retry mechanisms that restart the agent. This creates an infinite restart cycle.

## The Three Retry Mechanisms

1. **Max-turns retry** — 30s exponential backoff in `auto-mode-service.ts`. When an agent hits its turn limit, auto-mode retries with increasing delay (MAX_MAX_TURNS_RETRIES=3).

2. **Health monitor** — Every 30s, detects "stuck" in_progress features (no agent running) and resets them to backlog. Auto-mode then picks them up again.

3. **Circuit breaker** — 5-min cooldown auto-resumes auto-mode entirely. Creates fresh state with `hasEmittedIdleEvent: false`.

**`stopAutoLoopForProject()` does NOT clear retry timers or health monitor.** Force-stopping an agent just creates a failed state that all three mechanisms try to recover from.

## The Right Way to Stop

**Don't force-stop agents.** Let them complete naturally.

If the feature's work is already on main (PR merged), the agent will verify and exit cleanly without triggering retry. Force-stopping creates the infinite restart cycle.

### If Already in a Zombie Loop

1. Move the feature to `done` status — this removes it from the pending pool
2. Stop auto-mode for the project
3. Wait for any in-flight retry timers to expire (~30s)
4. Verify no agents running: `list_running_agents`
5. Only then restart auto-mode if needed

### If Agent Has Uncommitted Work

Check the worktree first:
```bash
git -C <worktree-path> status --short
git -C <worktree-path> diff --stat
```

If valuable work exists, commit and push it manually before letting the feature complete:
```bash
git -C <worktree-path> add <specific-files>
git -C <worktree-path> commit -m "WIP: agent turn-limit recovery"
git -C <worktree-path> push origin <branch>
```

## Prevention

- Set realistic `maxTurns` for feature complexity (small=25, medium=50, large=75)
- Monitor agent output early — catch wrong direction before turn limit
- Send context messages via `send_message_to_agent` to keep agents on track