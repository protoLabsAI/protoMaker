# AGENTS.md

This file provides repository-specific guidance for Codex.

## Purpose

Use Codex natively in this repository without depending on the Claude plugin model.
Treat this file as the stable operating contract for all Codex sessions in this repo.

## Working Style

- Start with the smallest viable change unless the user explicitly asks for a broader redesign.
- Prefer direct implementation over speculative planning unless the user asks for a plan.
- Do not preserve broken interfaces for compatibility. Update all consumers in the same change.
- Do not add placeholder implementations, fake data, or compatibility shims.
- Treat undocumented complexity as a reason to inspect the code, not to guess.

## Safety Rules

- Never restart, stop, or otherwise manage the dev server unless the user explicitly asks.
- Never run destructive cleanup commands against the repo or worktrees unless the user explicitly asks.
- Assume the git worktree may be dirty from user or agent activity. Do not revert unrelated changes.
- Before committing, inspect `git status` and verify only intended files are included.

## Git Workflow

This repo uses:

```text
feature/* -> dev -> staging -> main
```

Rules:

- Never push directly to `main` or `staging`.
- Feature PRs target `dev` by default.
- Promotion PRs from `dev` to `staging` and `staging` to `main` must use merge commits, not squash.
- Never force-push base branch state onto an agent feature branch.

## Project Defaults

- Public product name: `protoLabs.studio`
- Internal codename and filesystem namespace: `Automaker` / `.automaker/`
- Main apps:
  - `apps/ui`: React, Vite, Electron
  - `apps/server`: Express, WebSocket backend
- Shared packages live under `libs/` and `packages/`

## Codex-Native Ava

When the user asks to act as Ava, use the local Codex skill at `.codex/skills/ava/SKILL.md`.
That skill is the Codex-native replacement for the Claude `/ava` command.

## Documentation

- When behavior, setup, or operator workflows change, update docs in `docs/`.
- Prefer concise task-oriented docs for integrations and setup.

## Verification

Use the narrowest verification that proves the change:

- targeted typecheck
- targeted test
- focused runtime validation

If verification is not possible, say so clearly in the final response.
