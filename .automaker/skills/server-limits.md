---
name: server-limits
emoji: 🖥️
description: Server resource limits and safety rules. Use when tuning heap sizes, adjusting concurrent agent caps, or diagnosing OOM crashes. Trigger on "server crash", "out of memory", "heap size", "concurrent agents", "server limit", or "resource cap".
metadata:
  author: agent
  created: 2026-02-11T23:24:50.086Z
  usageCount: 0
  successRate: 0
  tags: [server, performance, agents, safety]
  source: learned
---

# Server Resource Limits

Hard-learned limits that prevent crashes, OOM kills, and infinite restart loops.

## Heap Memory

| Environment | Heap Size                         | Max Concurrent Agents |
| ----------- | --------------------------------- | --------------------- |
| Dev (local) | 8GB (`--max-old-space-size=8192`) | 2-3                   |
| Staging     | 32GB                              | 6-10                  |

- **4GB heap = instant OOM** with even one Sonnet agent (~4-5GB per agent)
- Configurable via `HEAP_STOP_THRESHOLD` / `HEAP_ABORT_THRESHOLD` env vars
- At 95% heap, agents abort → recovery retry → infinite crash loop

## Concurrent Agent Limit

**13+ concurrent agents = guaranteed server crash.** Consistent reproduction.

- Dev server safely handles 2-3 concurrent agents
- Staging handles 6-10
- Auto-mode `maxConcurrency` should match these limits

## NEVER Restart the Dev Server

This is Josh's explicit rule. Ask him to manage it. Server restart kills running agents and loses uncommitted worktree work.

## Zombie Agent Restart Loop

When `stop_agent` is called, THREE independent retry mechanisms can resurrect it:

1. Max-turns retry (30s exponential backoff) in auto-mode-service
2. Health monitor (every 30s) detects "stuck" in_progress features → resets them
3. Circuit breaker (5-min cooldown) auto-resumes auto-mode

`stopAutoLoopForProject()` does NOT clear retry timers or health monitor.

**Fix:** Don't force-stop agents. Let them complete naturally. If feature work is already on main, the agent will verify and exit cleanly.

## setInterval + Async Operations

Always add abort mechanism for async intervals. If `stop()` is called during an in-flight async operation, the process won't exit cleanly. Check abort flag at entry and before heavy operations in tick loops.
