# Skill Audit Report — Overlap Analysis

**Date:** 2026-03-12
**Skills audited:** 28
**Scope:** Identify keep/prune/merge decisions. No deletions in this pass.

## Summary

| Decision | Count | Skills |
|----------|-------|--------|
| KEEP | 18 | Unique value, no significant overlap |
| MERGE | 6 | Content overlaps; absorb into target, then remove source |
| PRUNE | 4 | Fully subsumed by another skill or CLAUDE.md |

**Net result after prune/merge pass:** 18 canonical skills (down from 28).

---

## KEEP — Unique value, retain as-is

### 1. `server-limits`
**Rationale:** Specific operational numbers (heap sizes, concurrent agent caps) not in CLAUDE.md. The 4GB/8GB/32GB heap details and the "13+ concurrent agents = crash" rule are hard-won operational knowledge. Partially overlaps `zombie-agent-recovery` on the retry mechanisms, but the server config angle is distinct.

### 2. `hitl-management`
**Rationale:** Ava-only operational workflow for managing pending forms. The `hitl-forms.md` context file covers the developer API; this covers Ava's operational loop (when to act, what to auto-resolve vs route to Josh). Distinct scope.

### 3. `dependency-management`
**Rationale:** Covers the dependency-disappear-on-reset bug, timing issues with auto-mode's first tick, and out-of-order recovery via send_message_to_agent. Some overlap with `auto-mode-troubleshooting` section 3, but this is developer-focused (setting deps correctly) vs diagnostic-focused.

### 4. `auto-mode-troubleshooting`
**Rationale:** The only consolidated diagnostic reference for why auto-mode picks up nothing. Five root causes with diagnostic commands. Some content overlaps `zombie-agent-recovery` (heap pressure) and `dependency-management` (section 3), but the checklist form is distinct value.

### 5. `plugin-management`
**Rationale:** Unique content on plugin lifecycle (install/update/reinstall), hooks.json format quirks, multiple-version diagnosis, and the TEMP-SKILLS.md cleanup reference. Not covered elsewhere.

### 6. `reactflow`
**Rationale:** Library-specific reference. No overlap with anything else in the skills directory or CLAUDE.md. Retain as a domain reference.

### 7. `pr-conflict-resolution`
**Rationale:** Specific rebase+stash workflow with exact commands. `worktree-patterns` covers pre-flight rebase; `hot-file-dependency-pattern.md` context covers avoidance. This covers *resolution after conflict*, which is a distinct and necessary reference.

### 8. `agent-preflight`
**Rationale:** Valuable as an orchestration checklist that synthesizes rules from worktree-patterns, monorepo-patterns, and dependency-management into a single pre-launch sequence. Agents and Ava both benefit from the consolidated "before launching" procedure.

### 9. `async-init-patterns`
**Rationale:** Specific coding pattern for fire-and-forget init race conditions. Includes code examples, bounded retry pattern, and setInterval/abort flag pattern. Not covered in CLAUDE.md or any context file.

### 10. `discord-integration`
**Rationale:** Discord-specific operational knowledge (two tokens, MCP login timeout workaround, message routing architecture, 2000-char limit). Not covered in CLAUDE.md or other skills.

### 11. `pr-pipeline`
**Rationale:** Keep as the canonical PR lifecycle reference after absorbing `ci-cd-patterns` and the unique parts of `agent-postflight`. This becomes the single PR reference.
**Action in merge pass:** Absorb `ci-cd-patterns` unique content (direct commits to main, self-hosted runner info) and `agent-postflight` steps into this file.

### 12. `mcp-integration-patterns`
**Rationale:** How to ADD new MCP tools — tool definition format, registration steps, handler pattern. Also serves as the canonical "never direct API calls" reference. After absorbing `mcp-discipline` and unique parts of `secrets-auth-rules`, this becomes the single MCP reference.
**Action in merge pass:** Absorb `mcp-discipline` common tools list and the `secrets-auth-rules` unique content (token separation, auto-login detail).

### 13. `zombie-agent-recovery`
**Rationale:** Distinct recovery procedure (let agents complete naturally, force-stop causes infinite loop, preserving uncommitted work). `auto-mode-troubleshooting` covers diagnostic but not the recovery procedure. `server-limits` covers the mechanism names but not the recovery steps.

### 14. `world-state-check`
**Rationale:** Operational situational-awareness checklist with decision matrix and monitoring cadence. Unique to Ava's operational role. No overlap with other skills or context files.

### 15. `session-continuity`
**Rationale:** Compaction recovery hook, auto-mode idle prevention fix (PR #272), memory-update-as-pre-backoff-responsibility, session handoff format. Most content is unique. The CWD death trap section duplicates `worktree-safety` (which we're pruning into `worktree-patterns`) but the rest is not covered elsewhere.

### 16. `testing-strategies`
**Rationale:** Test infrastructure table, event emission ordering tests, template verification patterns, dev server port conflict gotcha, private method testing anti-pattern. Not covered in CLAUDE.md or any context file.

### 17. `monorepo-patterns`
**Rationale:** The comprehensive monorepo reference. After absorbing `monorepo-build-order` unique content and `shared-package-gotchas` unique content (worktree symlink issue), this becomes the canonical monorepo reference.
**Note on CLAUDE.md overlap:** CLAUDE.md has the dependency chain, build commands, and import conventions. `monorepo-patterns` goes deeper on TypeScript project references, workspace resolution, and new-package creation steps. Worth retaining as a more detailed supplement.

### 18. `worktree-patterns`
**Rationale:** The most comprehensive worktree reference. After absorbing `worktree-safety`, `worktree-cleanup`, `headsdown`, and the incident context from `feature-data-safety`, this becomes the single canonical worktree reference.

---

## MERGE — Absorb into target, then remove source

### 19. `headsdown` → merge into `worktree-patterns`
**Overlap:** The pre-removal checklist (lock file, uncommitted changes, unpushed commits, running agents check) is the unique content here. `worktree-patterns` already covers safe removal order but lacks the pre-removal safety checklist detail.
**Unique content to preserve:** The full pre-removal checklist with lock file check commands. Add as "Pre-Removal Safety Checklist" section to `worktree-patterns`.

### 20. `feature-data-safety` → merge into `worktree-patterns`
**Overlap:** "Never checkout branches in main repo" and "never git add -A" are already in `worktree-safety` (which is merging into `worktree-patterns`).
**Unique content to preserve:** The Feb 10 incident story provides essential "why" context that makes the rules memorable. The backup strategy section (AtomicWriter .bak limitation, external backup location) is not elsewhere.
**Action:** Add "Data Safety — Incident Context" section to `worktree-patterns` with incident summary and backup strategy.

### 21. `worktree-cleanup` → merge into `worktree-patterns`
**Overlap:** Diagnostic commands and cleanup loop are consistent with `worktree-patterns` content. "Why worktrees block auto-mode" overlaps `auto-mode-troubleshooting` section 1.
**Unique content to preserve:** The "0 uncommitted / N ahead" decision matrix for preserving work before cleanup. The Crew Loop Delegation note.
**Action:** Add as "Stale Worktree Cleanup — Operational" section to `worktree-patterns`.

### 22. `agent-postflight` → merge into `pr-pipeline`
**Overlap:** Steps 3–7 (commit/push/PR, format, CodeRabbit, auto-merge, re-verify dependencies, enable auto-merge) duplicate `pr-pipeline`. The delegation note (PR Maintainer) is already in `pr-pipeline`.
**Unique content to preserve:** Step 1 (check for uncommitted work with `git status --short`) as an explicit first step.
**Action:** Add "Post-Agent Checklist" section to `pr-pipeline` that leads with the uncommitted-work check.

### 23. `ci-cd-patterns` → merge into `pr-pipeline`
**Overlap:** Branch protection rules are identical. Format check scope is in `pr-pipeline`. Common CI failures table partially duplicates. After-merging-shared-packages rebuild is in `monorepo-patterns`.
**Unique content to preserve:** Direct commits to main procedure (format first, build verify, recommend PR instead). Self-hosted runner details (ava-staging, UserProfile.infra.stagingHost reference).
**Action:** Add "Direct Commits to Main" and "Runner Configuration" sections to `pr-pipeline`.

### 24. `secrets-auth-rules` → merge into `mcp-integration-patterns`
**Overlap:** The two .env files table and "never direct API calls" rule are identical to content already in `mcp-integration-patterns`. "Never reference ~/.secrets/" is also in `mcp-integration-patterns` anti-patterns table.
**Unique content to preserve:** Token separation (DISCORD_TOKEN vs DISCORD_BOT_TOKEN, different consumers). Auto-login (AUTOMAKER_AUTO_LOGIN, when it's disabled in production). "Never commit .env files" as an explicit rule.
**Action:** Add "Token Separation" and "Auto-Login" notes, and the "never commit .env" rule to `mcp-integration-patterns`.

---

## PRUNE — Fully subsumed, remove after verifying no unique content is lost

### 25. `monorepo-build-order`
**Reason:** Fully subsumed by `monorepo-patterns`. The dependency chain diagram is identical. The build commands table is a subset. The "when to rebuild" table is a subset. The MCP server location note is already in `monorepo-patterns`.
**Unique content check:** The "agent prompt gap" note at the bottom (include build order in send_message_to_agent) is partially in `agent-preflight`. No unique content that can't live in `monorepo-patterns` or `agent-preflight`.

### 26. `shared-package-gotchas`
**Reason:** process.env crash is in `monorepo-patterns`. Dependency chain is in `monorepo-patterns`. Import rules are in CLAUDE.md and `monorepo-patterns`. Stale dist rebuild is in `monorepo-patterns`.
**Unique content check:** Worktree symlink issue (npm workspace hoisting resolves to main repo types, not worktree's modified types) — this is NOT in `monorepo-patterns`. Must be preserved.
**Action:** Before pruning, add the worktree symlink issue section to `monorepo-patterns`.

### 27. `mcp-discipline`
**Reason:** Fully subsumed by `mcp-integration-patterns`. The "never direct API calls" rule, rationale, and common MCP tools list are all in `mcp-integration-patterns`. The two .env files are in `mcp-integration-patterns`.
**Unique content check:** Nothing unique that isn't already in `mcp-integration-patterns`.

### 28. `worktree-safety`
**Reason:** `worktree-patterns` is a superset of `worktree-safety`. Every rule in `worktree-safety` (never cd, never checkout in main repo, never git add -A, CWD persists across Bash calls) is in `worktree-patterns` with equal or more detail.
**Unique content check:** Nothing unique.

---

## Cross-cutting observations

### Context file overlap (skills vs `.automaker/context/`)

The following context files already cover content that some skills repeat:

| Context File | Overlapping Skills |
|---|---|
| `prettier-before-commit.md` | `agent-postflight` (formatting steps), `pr-pipeline` (format failures) |
| `hot-file-dependency-pattern.md` | `pr-conflict-resolution` (conflict sources), `dependency-management` (partial) |
| `new-workspace-package.md` | `monorepo-patterns` (adding new packages section) |
| `shell-safety-patterns.md` | `feature-data-safety` (git add -A), `pr-conflict-resolution` (push safety) |

Context files are loaded into EVERY agent prompt automatically. Skills are invoked on demand. The distinction matters: repetition between skills and context files is acceptable (context files set guardrails, skills provide actionable reference). No pruning recommended based on context file overlap alone.

### CLAUDE.md overlap

CLAUDE.md covers: monorepo structure, dependency chain, build commands, import conventions, environment variables, git workflow rules.

Skills that overlap CLAUDE.md but add enough detail to justify retention: `monorepo-patterns`, `pr-pipeline`, `worktree-patterns`.

Skills that are near-verbatim CLAUDE.md excerpts with minimal additions: none identified. All skills have at least some operational depth beyond what CLAUDE.md covers.

---

## Recommended execution order for next phase (Prune & Merge)

Execute in this order to avoid losing content:

1. Add worktree symlink issue from `shared-package-gotchas` → `monorepo-patterns`
2. Add headsdown pre-removal checklist → `worktree-patterns`
3. Add feature-data-safety incident context + backup strategy → `worktree-patterns`
4. Add worktree-cleanup diagnostic + decision matrix + crew delegation → `worktree-patterns`
5. Add post-agent checklist (uncommitted work step) → `pr-pipeline`
6. Add direct-commits-to-main + runner info from `ci-cd-patterns` → `pr-pipeline`
7. Add token separation + auto-login + never-commit-env from `secrets-auth-rules` → `mcp-integration-patterns`
8. Absorb `mcp-discipline` common tools list into `mcp-integration-patterns` (already largely there)
9. Prune: `monorepo-build-order`, `shared-package-gotchas`, `mcp-discipline`, `worktree-safety`
10. Remove source files for merged skills: `headsdown`, `feature-data-safety`, `worktree-cleanup`, `agent-postflight`, `ci-cd-patterns`, `secrets-auth-rules`
