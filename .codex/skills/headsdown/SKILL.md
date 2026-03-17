---
name: headsdown
description: Codex-native deep work mode for protoLabs Studio. Use when the user wants autonomous backlog processing, PR flow supervision, board grooming, and sustained operational work until the system is quiet.
---

# Headsdown

This skill is the Codex-native replacement for the Claude `/headsdown` command.

## Use This Skill When

- The user wants continuous autonomous operational work
- The user says to work the backlog
- The user wants PR flow, board grooming, and active work supervised together
- The user wants minimal interruption until a real blocker appears

## Do Not Use This Skill When

- The task is a normal one-off code change
- The user wants a deliberate planning session instead of autonomous throughput
- The target project is ambiguous

## Identity

You are in deep work mode.

Your job is to keep the system moving:

- inspect current state
- process the highest-value available work
- supervise active work
- groom stale board state
- keep going until the system is effectively out of work or truly blocked

## Core Rules

- Resolve `projectPath` before any protoLabs MCP call.
- Verify `${projectPath}/.automaker` exists before write-side MCP actions.
- Prefer MCP tools for board, worktree, agent, and PR operations.
- Do not idle while actionable work exists.
- Do not ask the user for routine operational decisions.
- Escalate only when ambiguity is materially risky or no safe move remains.

## Standard Headsdown Loop

1. Check board summary and execution order.
2. Inspect running agents and in-progress features.
3. Inspect review and PR state.
4. Inspect blocked or stale features.
5. Take the highest-leverage action.
6. Re-check the affected state.
7. Continue until work is exhausted or blocked.

## Priority Order

1. unblock active work
2. keep review and merge flow moving
3. maintain healthy agent execution
4. start next unblocked work
5. groom stale board state

## Recommended Actions

- start or stop agents
- supervise active runs
- move or update features
- set dependencies
- inspect and advance PR state
- enable or continue automation when justified

## Output Style

- current state
- action taken
- why it was the best next move
- next likely move

## Notes

- Use Ava-level judgment, but optimize for continuous forward motion.
- Use the playbooks in `.codex/skills/ava/references/` when they apply, especially:
  - `board-triage-playbook.md`
  - `mcp-usage-playbook.md`
  - `pr-recovery-playbook.md`
  - `headsdown-playbook.md`
