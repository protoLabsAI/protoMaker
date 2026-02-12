# Project: Ava Autonomy Upgrade

## Goal
Eliminate manual workarounds and enable fully autonomous operation by fixing broken tooling, adding critical MCP tools for PR/worktree lifecycle, hardening hooks for state persistence, and exposing observability endpoints

## Milestones
1. Phase 2: Critical MCP Tools - Add 6 MCP tools for PR lifecycle and worktree management. 3 need new server routes (GitHub merge/status), 3 wrap existing routes (worktree list/status/create-pr). Eliminates gh CLI dependency for core autonomous workflows.
2. Phase 3: Hook Improvements - Add 4 hooks for state persistence and failure detection. PreCompact saves state before context wipes, SessionEnd persists for next startup, PostToolUseFailure detects MCP failures, stop hook upgrades to JSON format with structured idle tasks.
3. Phase 4: Observability MCP Tools - Add 6 MCP tools for health, settings, events, notifications, and GOAP. All server routes already exist, just need MCP wrappers. Enables direct access to system state without UI or manual API calls.
