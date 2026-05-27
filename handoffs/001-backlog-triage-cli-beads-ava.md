# Handoff: Sprint close-out + backlog triage (CLI fixes, beads UI init, Ava CLI fallback)

**Date**: 2026-05-27
**Handoff Number**: 001

---

## Overview/Summary

This session drove the entire `protomaker-*` beads board to **done** (both harness-eval sprints + operator tooling), then worked the GitHub issue backlog: closed everything already-resolved, and shipped fixes for the clean, well-scoped items. The beads board is now empty (0 open / 0 in-progress). 14 GitHub issues remain open — all genuine backlog that is either larger feature work or needs a product/infra decision (none are stale).

Net this session: **6 fix/feature PRs merged** + the prior sprint PRs, **12 issues closed**, **3 follow-ups filed**, board cleared.

## Background/Context

- Triggered by validating the `/cli-control` skill (bead `3do`) after a Claude restart made the plugin MCP live. Exercising the CLI surfaced five real bugs that made most of the `protomaker` CLI unusable — fixed in #3924.
- The user then asked to triage and close out the GitHub backlog "as needed," and finally whether the Ava persona knew about the CLI skill (it didn't — fixed in #3932).
- Standing constraints (still apply): never push to `main` directly (PR only); never use `--admin`/`--auto`; never `cd` into worktrees (use `git -C`/absolute paths); do not start/stop the dev server (the `ai.protolabs.protomaker` LaunchAgent is the exception and auto-reloads); no Anthropic keys — gateway only; no emojis except ✅/❌; verify `gh pr create` returns an `https://` URL before closing a bead/issue.
- PR merge pattern used all session: background gh-only watcher polling `mergeStateStatus`, squash-merge on `CLEAN`/`UNSTABLE`. Never merge on pending/failing CI.

## Current State

Completed (merged to `main`):

- [x] **Harness-eval program** — both sprints (substrate, eval gate, verifier gate, run-telemetry, failure-taxonomy → proposer → eval-gated auto-improve flywheel). PRs #3908/#3913–#3919.
- [x] **CLAUDE.md decomposition** (#3920) + **best-of-N spike** (#3922) + **operator runbook** (#3921).
- [x] **CLI repair (#3924)** — 5 bugs: positional-arg commands unreachable (`new Command('x <a>')` doesn't parse args in Commander v14 → use `.arguments()`), `feature` group never registered, stale `(program, flags)` signatures, global flags read from local opts (→ `optsWithGlobals()`), `feature list` missing `projectPath`. + `feature-wiring.test.ts`.
- [x] **Beads UI init (#3927, bead `gyd`)** — `BeadsService.status()`/`.init()`, `POST /api/beads/{status,init}`, UI "Initialize beads" empty state. `br` errors land on **stderr** (key detail).
- [x] **Cleanup (#3930)** — pruned dead content-tool refs from cindi/jon `allowed-tools` (#3912); deleted orphaned `create-protolab/templates/cicd/github-actions/` (#3898).
- [x] **Sitrep staging-delta (#3931)** — settings-driven `stagingDeltaBranches` + ref-existence guard + `applicable` flag; new `ResolvedGitWorkflowSettings` type; git-settings docs (#3874).
- [x] **Ava CLI fallback (#3932)** — taught the `ava.md` plugin skill to fall back to `/cli-control` when MCP is down (NOT the UI-chat persona — it has no shell).

Remaining (open GitHub issues — see table below):

- [ ] 14 open issues; **#3803** is the next clean autonomous bug-fix.

## Technical Approach

- **Greenfield-first** (per CLAUDE.md): no compat shims; delete dead code; touch all consumers when changing a type (e.g. `ResolvedGitWorkflowSettings` propagated to DEFAULT, the resolver, and both UI settings panels).
- **Platform-first**: no hardcoded workflow values — the staging-delta branch pair became the optional `GitWorkflowSettings.stagingDeltaBranches` setting (unset = not tracked, the single-main default).
- **Test pattern for shelling-out services**: mock `node:child_process` with the `promisify.custom` symbol (see `tests/unit/lib/gh-pr-create.test.ts`). For sequenced calls, use ordered `mockImplementationOnce` and DON'T read `args` inside a persistent `mockImplementation` (a rejection triggers a spurious 2nd call with `undefined` args — burned ~20 min on this).
- **`br` (beads) behavior**: structured `{error:{code}}` JSON (`NOT_INITIALIZED`, `ALREADY_INITIALIZED`) goes to **stderr**, exit 2 — even with `--json`. `br` auto-discovers `.beads/` by walking up parent dirs (so status detection on a nested dir finds the parent store).
- **Doc-as-you-build**: new settings documented in `docs/reference/git-settings.md`; CLAUDE.md beads section notes the new endpoints.

## Key Files and Documentation

| File                                                                                   | Purpose                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/cli/src/cli.ts`, `feature.ts`, `agent.ts`, `pr.ts`, `queue.ts`, `context.ts` | CLI command wiring + `optsWithGlobals()` fix (#3924)                  |
| `packages/cli/test/feature-wiring.test.ts`                                             | CLI wiring/flag regression test                                       |
| `apps/server/src/services/beads-service.ts`                                            | `status()`/`init()` + `runAllowFail()`/`errorCode()`                  |
| `apps/server/src/routes/beads/index.ts`                                                | `/status`, `/init` routes                                             |
| `apps/ui/src/components/views/beads-view/beads-view.tsx`                               | "Initialize beads" empty state                                        |
| `apps/server/src/routes/sitrep/index.ts`                                               | `getStagingDelta()` settings-driven + `resolveStagingDeltaBranches()` |
| `libs/types/src/git-settings.ts`                                                       | `stagingDeltaBranches`, `ResolvedGitWorkflowSettings`                 |
| `packages/mcp-server/plugins/automaker/commands/ava.md`                                | Ava `/cli-control` fallback section                                   |
| `docs/reference/git-settings.md`                                                       | git settings reference (updated)                                      |
| `docs/internal/dev/best-of-n-spike.md`                                                 | best-of-N spike (recommendation: Option A, PLAN sampling)             |

## Acceptance Criteria

This handoff's scope (sprint close-out + clean backlog) is **complete**:

- [x] All `protomaker-*` beads closed; board empty
- [x] All already-resolved GitHub issues closed with references
- [x] All clean/well-scoped issues fixed, tested, merged
- [x] Remaining issues are genuine open work (not stale), triaged below

## Open Questions/Considerations

- **#3798 / #3801 (review gating)** need a **branch-protection ruleset decision** (required approving reviews / `required_conversation_resolution` on `main`). Can't be fully fixed in code alone — partly a GitHub admin action.
- **#3893 (per-project FS isolation)** is a security design task + a prod-env change (`ALLOWED_ROOT_DIRECTORY` unset in prod). Needs scoping with the owner.
- **#3815 / #3819 (fleet CI security)** are cross-repo / fleet-wide rollouts.
- Quinn-related issues (#3900) are cross-repo behavior tuning (Quinn's handler lives in protoWorkstacean).
- Follow-ups filed this session: **#3929** (jon.md body still uses removed content tools — needs a product call on jon's content path), **#3925** (extend CLI wiring tests to all groups), **#3923** (implement best-of-N PLAN from the spike).

## Next Steps

1. **#3803 — Epic blocks on completion when children PR to main directly** (next clean autonomous fix). `CompletionDetectorService` opens an epic→base PR from the epic branch, which is 0 commits ahead when children merged to `main` directly → epic flips to `blocked`. Fix: detect the empty-epic-branch case and mark the epic `done` (children already merged) instead of attempting a PR. Self-contained in the server; add a unit test.
2. Decide the **review-gating** direction (#3798/#3801): enable the rulesets + build the REVIEW-phase thread-resolution loop, or defer.
3. Triage the feature requests (#3865 ACP, #3791 Ava file tool, #3794 haiku branch names, #3859 distillation) into beads when prioritized.
4. Address **#3929** (jon.md content workflow) once the content-pipeline replacement path is decided.

### Reproduce the board/PR state

```bash
RUST_LOG=error br list --json            # 0 open / 0 in-progress
gh issue list --repo protoLabsAI/protoMaker --state open   # 14, all genuine backlog
gh pr list --repo protoLabsAI/protoMaker --author "@me" --state open   # none
```
