# PRD: Ava Autonomy Upgrade

## Situation
Ava has 19 skills, 39 Automaker MCP tools, ~20 Discord MCP tools, and 5 automation hooks. However, comprehensive self-audit revealed critical structural gaps: 145 broken MCP tool references across 15 skills (Phase 1 COMPLETE - PR #191), zero PR lifecycle tools forcing daily gh CLI workarounds, no worktree management beyond graphite_restack, missing PreCompact/SessionEnd hooks causing state loss, no health/settings/events/notifications MCP exposure, and vague stop hook idle behavior.

## Problem
Ava cannot operate autonomously. Every PR merge requires manual gh CLI commands. Agent work in worktrees is invisible until manually inspected. Context compaction wipes operational state. MCP tool failures go undetected. Settings require UI access. These gaps force constant human intervention and make 24/7 headless operation impossible.

## Approach
Four-phase rollout building on PR #191 foundation. Phase 2: Add 6 critical MCP tools (3 new server routes for GitHub merge/status, 3 wrappers for existing worktree routes). Phase 3: Add 4 hooks (PreCompact state save, SessionEnd persistence, PostToolUseFailure detection, stop hook JSON upgrade). Phase 4: Add 6 observability tools (all routes exist, just need MCP wrappers). Each phase independently valuable, prioritized by autonomy impact.

## Results
Full autonomous PR lifecycle (merge, status check, thread resolution via MCP). Complete worktree visibility and control. State persistence across compaction and session boundaries. Automatic MCP failure detection and recovery. Direct settings/health/events/notifications access. Structured idle task execution. Measurable: zero manual gh CLI calls for PR operations, zero context-loss incidents post-compaction, zero undetected MCP failures.

## Constraints
Phase 1 already shipped (PR #191), start from Phase 2,New server routes must follow existing patterns (execFileAsync for git/gh, service layer separation),Hook changes require plugin reinstall not just update,MCP tools must use apiCall() pattern from existing tools,Settings tools need auth checks (authenticated endpoints),GOAP tools low priority until GOAP system stabilizes
