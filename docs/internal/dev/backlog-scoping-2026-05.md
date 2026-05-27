# Backlog scoping — decision-bound issues (2026-05-27)

Scoping plans for the open issues that need a product/infra decision or are large
enough to warrant a plan before coding. Each entry: **what**, **approach**, **key
files**, **effort**, **risk**, **decision needed**. Lanes A+B of the day plan
shipped directly; this is the "scope C" deliverable.

---

## #3923 — Best-of-N on PLAN (architectural tier)

**What:** Implement Option A from the best-of-N spike (`docs/internal/dev/best-of-n-spike.md`): for `complexity: 'architectural'` features, generate N candidate PLANs, rank them with a reasoning-tier judge, proceed with the best.

**Approach:**

- New workflow setting `bestOfN?: { enabled: boolean; n: number }` (default `{ enabled: false, n: 3 }`) on `WorkflowSettings`.
- In the PLAN processor (`lead-engineer-plan-processor.ts`), when enabled AND `complexity === 'architectural'`: run the existing plan generation N times (vary nothing but sampling), then a reasoning-tier judge call (`simpleQuery`, reasoning model) ranking the N plans against spec + acceptance; pick the top. Record alternatives + rationale to the trajectory.
- Gate strictly to architectural tier; never for small/medium.

**Key files:** `libs/types/src/workflow-settings.ts` (+default), `apps/server/src/services/lead-engineer-plan-processor.ts`, the reasoning-judge prompt, `apps/server/eval/*` (new scenario).

**Effort:** Large. This is a PLAN-phase pipeline change → per our convention it needs an **eval scenario + baseline bump** (and trips the harness-eval CI gate). N× plan calls on the reasoning tier also has a measurable cost footprint.

**Risk:** Cost (N reasoning calls); must be measured-on before default-enable.

**Decision needed:** Greenlight building it now vs. waiting for evidence that PLAN quality is the dominant architectural-failure cause. Spike recommendation was **go on A** but as a measured rollout. Recommend: build behind the default-off flag + eval scenario, measure architectural success rate flag-on vs off before enabling.

---

## #3798 / #3801 — Review gating (CI-pass-alone merges)

**What:** Agent PRs merge to `main` on green CI with no gating review (Quinn only `COMMENTED`; `required_approving_review_count = 0`). #3801 adds: require PR review threads resolved before merge + auto-address them in REVIEW.

**Approach (two halves):**

1. **GitHub-native gate** — enable `required_conversation_resolution` (and optionally a required review count) on the `main` ruleset. _This is a branch-protection admin change, not code._
2. **Pipeline handling** — in the LeadEngineer REVIEW phase, when a PR has unresolved threads: fetch them (GraphQL `reviewThreads` / `get_pr_review_comments`), dispatch the agent in the worktree to address them (bounded to N iterations), resolve, re-push.

**Key files:** `lead-engineer-review-processor.ts`, the merge-eligibility service, GitHub ruleset (out-of-repo).

**Effort:** Medium-large (the pipeline loop). The gate itself is a 5-minute admin toggle.

**Decision needed:** **You** must decide the ruleset change (required reviews / conversation resolution on `main`) — it changes how _every_ PR merges, including these autonomous ones. Once decided, the pipeline half is buildable. Recommend: enable `required_conversation_resolution` first (low-risk, high-value), then build the auto-address loop.

---

## #3893 — Per-project filesystem isolation (security)

**What:** A project should only read/write within its own repo + `.automaker/`. Today `ALLOWED_ROOT_DIRECTORY` is the only boundary and is **unset in prod**, so isolation isn't enforced across projects on one instance.

**Approach:** Resolve a per-request/per-project allowed root (the project's `projectPath`) and thread it through `validatePath`/`secureFs` rather than relying on a single global env var; set `ALLOWED_ROOT_DIRECTORY` (or the per-project equivalent) in prod.

**Key files:** `libs/platform/src/security.ts`, `secure-fs.ts`, the server bootstrap, prod env (homelab-iac).

**Effort:** Medium (security-sensitive design) + a prod env change.

**Decision needed:** Security design review — is per-project root enforced at the path layer, or via process/worktree isolation? Needs an owner. Recommend a short design doc before coding; this is genuinely a security posture decision, not a quick fix.

---

## #3865 — ACP (Agent Client Protocol) support in Ava chat

**What:** Let Ava chat connect to external CLI agents (Claude Code, Gemini, Codex, OpenCode) over ACP (JSON-RPC 2.0 over stdio).

**Effort:** Large feature. The audit on the issue notes chat and the provider abstraction are two separate systems — ACP would be a new transport/provider.

**Decision needed:** Prioritization + scoping as its own project (SPARC PRD candidate). Not a single-PR item. Defer unless explicitly prioritized.

---

## #3815 — Fleet deploy-workflow injection audit (cross-repo)

**What:** The CWE-94 hole fixed in protoMaker (#3811/#3812, and the broader set just hardened in #3819) is likely copy-pasted across ecosystem repos' `deploy-*.yml`.

**Approach:** Now that #3819 ships `workflow-security-lint.yml` in the `create-protolab` onboarding template, the remaining work is **backfilling existing managed repos** (add the linter + pin actions + fix any injections). This is a fleet rollout, repo by repo.

**Effort:** Medium per repo × N repos (cross-repo).

**Decision needed:** Which repos are in scope + rollout order. Cross-repo — can't be done from protoMaker alone. Pairs with #3819's deferred fleet half.

---

## #3900 — Quinn: verify cross-repo assumptions before a verdict

**What:** On PR #3896 Quinn returned a false HIGH (wrong claim about shallow-clone + pnpm) and missed a real blocker. Quinn should verify cross-repo assumptions before asserting.

**Effort:** Small-medium, but Quinn's behavior is largely prompt/skill tuning, and the handler partly lives in protoWorkstacean.

**Decision needed:** Whether to tune Quinn's review prompt here or in workstacean. Likely a prompt-hardening change (require evidence/verification before HIGH severity). Recommend pairing with the prompt-improvement skill.

---

## #3859 — Distill fast-model micro-tasks into small models

**What:** Capture fast-tier I/O (branch names, titles, file descriptions, commit messages) as training data → distill tiny purpose-built models.

**Status:** Capture has **started** — `branch-name-generator.ts` already writes training rows to `.automaker/training/branch-names/captures.jsonl` (#3794).

**Effort:** Large/research (the distillation itself). The remaining near-term, buildable slice: extend capture to the other fast-tier tasks (generate-title, commit messages, file descriptions) using the same `captureTrainingRow` pattern.

**Decision needed:** Prioritization. Recommend: opportunistically extend capture to other fast-tasks (cheap, fail-open) and defer actual distillation until there's volume.

---

## #3929 — jon.md content workflow on removed tools

**What:** `jon.md` body still documents a content workflow built on the 6 MCP tools removed in #3911 (its `allowed-tools` frontmatter was pruned in #3912/#3930, but the init step + "Cindi Coordination Protocol" section still call `list_content`/`create_content`/etc.).

**Effort:** Small — but needs a **product call**: did the content pipeline move elsewhere, or is it deprecated?

**Decision needed:** If moved → point jon's steps at the new surface. If deprecated → remove the `list_content` init call + the coordination-protocol tool steps. Acceptance: `grep` for the removed tool names in `jon.md` returns nothing (or only real, served tools).

---

## Summary of what needs YOUR decision

| Issue       | Decision                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| #3923       | Greenlight building best-of-N on PLAN (flag-gated, eval-measured)?                      |
| #3798/#3801 | Branch-protection ruleset change on `main` (required review / conversation resolution)? |
| #3893       | Security design: per-project root enforcement approach + prod env                       |
| #3865       | Prioritize ACP as its own project?                                                      |
| #3815       | Which repos + order for the fleet linter/injection backfill?                            |
| #3900       | Tune Quinn here vs. protoWorkstacean?                                                   |
| #3859       | Prioritize distillation, or just keep extending capture?                                |
| #3929       | jon's content path: re-point or remove?                                                 |
