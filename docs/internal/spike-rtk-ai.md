# Spike: rtk-ai/rtk

**Date:** 2026-02-28
**Status:** Complete

## What is RTK?

[rtk-ai/rtk](https://github.com/rtk-ai/rtk) is a CLI proxy tool ("Rust Token Killer") that wraps shell commands to compress their output before it reaches an LLM's context window. It specifically targets Claude Code users. The project is written in Rust and distributed as a statically linked binary.

The core mechanism: a `PreToolUse` hook in Claude Code's settings intercepts Bash tool calls, rewrites them as `rtk <original-command>`, and RTK returns filtered, compact output instead of the raw full output.

## Claims vs. Reality

### Token reduction: 60-90% (partially substantiated)

**What the claim means:** RTK measures savings as `(raw_chars - filtered_chars) / 4`, using a 4-chars-per-token heuristic. This is not the Anthropic tokenizer — it is a character-ratio approximation.

**Is the filtering real?** Yes. The filtering logic is substantive:

- `git status` on a large repo: 2,000+ chars → ~200 chars (strips untracked noise, uses compact porcelain). Plausible 90% reduction.
- `cargo test` with verbose compilation: 50,000+ chars → failure-lines only. Plausible 90%+ reduction.
- `npm run build` output: strips `>` headers, `npm WARN`, progress spinners.
- `go test`: injects `-json` and parses NDJSON event stream for structured output.

**What is marketing copy:** The "typical 30-minute session drops from ~150k to ~45k tokens" figure is an illustrative scenario, not a measured result from any reproducible artifact in the repository. The landing page claim of "89% avg. noise removed based on 2,900+ real commands" has no backing dataset in the repo.

### Zero dependencies (misleading)

The binary statically links Rust's standard library and bundles SQLite (via `rusqlite`'s `bundled` feature). It has 14 Cargo dependencies. The claim means "no runtime system dependencies," which is accurate, but the phrasing is a marketing simplification.

### Implementation quality

The codebase is real and substantive. Notable engineering:

- **3-tier parsing (Vitest):** tries full JSON parse, falls back to regex, falls back to passthrough. Production-quality defensive design.
- **NDJSON streaming (Go tests):** injects `-json`, parses structured Go test event stream correctly.
- **Exit code propagation:** multiple handlers propagate the underlying command's exit code.
- **`discover` command:** reads Claude Code's `.jsonl` session files from `~/.claude/projects/` to analyze actual token usage. Reverse-engineers Claude Code's internal session format.
- **`rtk gain`:** tracks savings in a local SQLite DB, integrates with `ccusage` npm package for dollar-value estimates.

The project is 5 weeks old as of this spike (created Jan 22, 2026) with 279 commits and active external contributors.

## Critical Issues

### Security bypass (Issue #260 — unresolved as of Feb 28, 2026)

**This is the most significant concern for Claude Code users.**

The `PreToolUse` hook unconditionally emits `"permissionDecision": "allow"` for any command that matches RTK's rewrite patterns. This bypasses the user's `.claude/settings.json` deny rules — including `git push --force`, `git branch -D`, and `gh pr merge`.

If you use Claude Code's permission system as a safety guardrail (which protoMaker does), installing RTK's hook silently nullifies those guardrails for matched commands. A fix has been proposed in the issue but has not been merged as of this spike date.

### Token counting is approximate

`estimate_tokens(text) = ceil(text.len() / 4.0)` — this is a heuristic, not the Anthropic BPE tokenizer. Savings percentages are character-compression ratios, not actual token counts.

### Codebase immaturity

Active bugs as of late Feb 2026:

- Issue #208: benchmark script covers only 22 of ~50 implemented commands
- Issue #266: `git commit --amend` silently broken
- Issue #265: GLIBC incompatibility on Ubuntu 22.04 LTS
- Issue #259: pnpm with `--filter` breaks
- Issues #236, #229, #257: basic flag compatibility bugs in grep/rg

### `local_llm.rs` is misleadingly named

Despite the name, this module does regex-based static analysis with no LLM inference. The `_model` and `_force_download` parameters exist but are unused.

## Commands Implemented

Git, GitHub CLI, Cargo, npm/pnpm, pytest, ruff, pip, Go, golangci-lint, TypeScript, Vitest, Playwright, Prettier, Prisma, Docker, curl, wget, grep/rg, ls, tree, find, diff, wc, env — plus analytics commands (`gain`, `discover`, `cc-economics`).

## Should protoMaker Use RTK?

**Short answer: Not yet, and not without resolving the security bypass.**

The token compression idea is mechanically sound and could meaningfully reduce costs for agent runs. However:

1. The security bypass (issue #260) directly conflicts with protoMaker's safety model. Our `PreToolUse` hooks and `.claude/settings.json` deny rules are a key guardrail for autonomous agents. RTK's hook would silently override them.

2. The project is 5 weeks old with active bugs in basic flag handling. For autonomous agent use (not interactive use), silent mishandling of commands (wrong exit codes, stripped output) creates debugging nightmares.

3. The savings claims are partially marketing copy. Real savings will vary significantly based on which commands the agent actually calls.

**Revisit at v1.0** once the security issue is resolved and the project has stabilized. If the savings claims hold in practice, this could be worth integrating as an opt-in setting for cost-sensitive users.

## Alternative Approaches

If token reduction is a priority now, safer options:

- Compact system prompts (already partially done)
- Truncating raw tool output in our own hooks before it hits context
- Filtering noise in our event stream before it is included in agent context
- The `cc-economics` approach: run `ccusage` post-session for cost visibility rather than trying to intercept at runtime
