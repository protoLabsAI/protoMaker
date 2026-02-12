---
name: session-continuity
emoji: 🔄
description: Maintaining operational context across long sessions — compaction recovery, idle prevention, memory updates, and session handoff.
metadata:
  author: agent
  created: 2026-02-12T16:56:31.627Z
  usageCount: 0
  successRate: 0
  tags: [session, compaction, context, operations, continuity]
  source: learned
---

# Session Continuity

How to maintain operational context across long sessions, compaction events, and session boundaries.

## Context Compaction

Claude Code automatically compresses prior messages as the conversation approaches context limits. This can cause identity/context loss.

### Compaction Recovery Hook

The `SessionStart` hook with `compact` matcher re-injects:
- Ava identity and operational role
- Headsdown workflow loop
- Project path and board state
- Active skill reminders
- Communication channels

This fires automatically — no manual intervention needed.

### What Gets Lost in Compaction

- Specific code snippets from earlier in the conversation
- Detailed error messages and stack traces
- File contents that were read but not summarized
- Intermediate reasoning about approach decisions

### What Survives Compaction

- MEMORY.md (always loaded in system prompt)
- CLAUDE.md project instructions
- Plugin hooks and skills
- Active skill prompts (if invoked before compaction)

## Auto-Mode Idle Prevention

When the board is empty, auto-mode can spam events due to circuit breaker auto-resume:
- Circuit breaker creates fresh state every 5 minutes
- Fresh state resets `hasEmittedIdleEvent: false`
- Result: 190+ duplicate `auto_mode_complete` events

**Fix (PR #272):** Loop now breaks entirely after emitting the idle event when no work remains. Stop auto-mode when the board is clear.

## Memory Updates (Pre-Backoff Responsibility)

Before entering exponential backoff or signing off:
1. Update `MEMORY.md` with completed work
2. Note any in-flight PRs or pending CI
3. Record new operational lessons
4. Document current board state

**Josh's requirement:** Documentation is a pre-backoff responsibility. Don't "play catchup" later.

## Session Handoff

When context runs out mid-task, the session continuation summary should include:
1. What was being worked on
2. Exact file paths and line numbers of changes
3. Build/test status
4. What remains to be done
5. Any errors that need fixing

## CWD Death Trap

If you `cd` into a worktree and it gets deleted, ALL Bash calls fail permanently. Even `bash -c 'cd /valid/path && command'` fails because the OS can't spawn the shell.

**Only non-shell tools work:** MCP, Read, Write, Edit, Grep, Glob, Discord.

**Prevention:** NEVER `cd` into worktree directories. Use `git -C <path>` or absolute paths.

**Recovery:** Session restart is the ONLY fix.