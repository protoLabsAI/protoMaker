---
name: bug_triage
description: Autonomous PR remediation — triage a failing or blocked PR, assign a feature, start auto-mode, then antagonistically review on completion. Dispatched by protoWorkstacean's pr-remediator plugin.
category: operations
argument-hint: (receives full PR context via A2A dispatch — no manual invocation)
allowed-tools:
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__get_feature
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__update_feature
  - mcp__plugin_protolabs_studio__get_board_summary
  - mcp__plugin_protolabs_studio__start_auto_mode
  - mcp__plugin_protolabs_studio__get_auto_mode_status
  - mcp__plugin_protolabs_studio__list_running_agents
  - mcp__plugin_protolabs_studio__start_agent
  - mcp__plugin_protolabs_studio__get_agent_output
  - mcp__plugin_protolabs_studio__check_pr_status
  - mcp__plugin_protolabs_studio__get_pr_feedback
  - mcp__plugin_protolabs_studio__resolve_pr_threads
  - mcp__plugin_protolabs_studio__merge_pr
  - mcp__plugin_protolabs_studio__get_settings
---

# bug_triage — autonomous PR remediation

**You are operating in fully autonomous mode.** This skill is dispatched by protoWorkstacean's `pr-remediator` plugin when a PR on one of the managed projects is failing CI, has CHANGES_REQUESTED, or is stuck. Your job is to run the full lifecycle without asking the operator for permission.

## The contract

Every dispatch arrives with these metadata fields (A2A `message/send` → `params.metadata`):

| Field         | Example                            | Meaning                                                                             |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `projectSlug` | `"protomaker"`                     | Target project slug from `workspace/projects.yaml`                                  |
| `projectRepo` | `"protoLabsAI/protoMaker"`         | GitHub owner/repo                                                                   |
| `projectPath` | `"/home/josh/dev/labs/protoMaker"` | **Absolute path to the target repo — use this as `projectPath` on every tool call** |
| `prNumber`    | `3332`                             | The PR number being remediated                                                      |

**The `projectPath` in metadata is authoritative.** Do NOT default to Ava's own project. Every tool call that accepts a `projectPath` parameter MUST use the value from metadata. If metadata.projectPath is missing, derive it from projectSlug + known workspace conventions, or reply with an error line.

## Mandatory lifecycle

Execute these steps in order. Do not stop until you reach a terminal state (step 5 or 6).

### Step 1 — Triage

```
check_pr_status({ projectPath, prNumber })
get_pr_feedback({ projectPath, prNumber })
```

Read the failing workflow name(s) and any review threads. Form a one-line root-cause hypothesis.

### Step 2 — Reconcile with existing state

```
list_features({ projectPath })
```

Scan for any feature whose title or description references `#${prNumber}`:

- **No feature exists** → proceed to step 3.
- **Feature exists in `backlog` or `in_progress`** → do NOT duplicate. Skip to step 5 (respond "in progress"). The remediator re-dispatches every ~5 min; this reconciliation is how idempotency works.
- **Feature exists in `done` state** → skip to step 6 (antagonistic review).

### Step 3 — Assign

```
create_feature({
  projectPath,
  title: "fix(ci): PR #${prNumber} — <one-line root cause>",
  description: "...RCA...\n\nPR: ${projectRepo}#${prNumber}\nFailing workflow: ...\nHeadSha: ...",
  status: "backlog",
  priority: 2,
  category: "bug",
})
```

The title MUST start with `fix(ci):` or `fix(review):` and MUST contain `#${prNumber}` so step 2 can find it on subsequent re-dispatches.

### Step 4 — Kick off

```
get_auto_mode_status({ projectPath })
```

If not already running:

```
start_auto_mode({ projectPath, maxConcurrency: 1 })
```

If already running, do nothing — the new feature will be picked up on the next tick.

### Step 5 — Respond "in progress"

Reply with exactly this one line (substitute the real feature ID and slug):

```
Assigned <featureId> on <projectSlug>, auto-mode running. Will antagonistically review on completion.
```

No preamble, no analysis, no markdown. This is the terminal state for fresh dispatches.

### Step 6 — Antagonistic review (only when feature is `done`)

When step 2 finds the fix feature in `done` state, the agent has shipped new commits to the PR. Re-check the PR and perform an adversarial review:

```
check_pr_status({ projectPath, prNumber })
```

Read the current CI, review state, and diff. Apply the **Jon critic lens**:

- **Regressions** — did the fix introduce new failures elsewhere?
- **Incomplete fixes** — does the patch only address the symptom, not the root cause?
- **Hidden assumptions** — are there edge cases the fix didn't cover?
- **Mislocated tests** — are new tests in the wrong layer (unit where integration is needed)?
- **Missing edge cases** — nullability, empty arrays, concurrent access, failure modes?
- **Scope creep** — did the fix touch unrelated files?
- **Dead code** — was code removed safely, or are there orphaned references?

**If any concerns exist:**

```
get_pr_feedback({ projectPath, prNumber })
# post a concrete change request comment describing each concern
update_feature({ projectPath, featureId, status: "in_progress", description: "<appended bounce-back notes>" })
```

Reply with: `Review: BOUNCED. <N> concerns. Re-assigned to in_progress.`

**If the review passes** (CI green, no regressions, scoped fix, adequate tests):

```
merge_pr({ projectPath, prNumber, mergeMethod: "squash" })
```

Reply with: `Review: APPROVED. Merged PR #${prNumber}.`

## Hard rules

1. **No permission checks.** Do not ask the operator. Do not present menus. You are authorised for the full lifecycle including `create_feature`, `start_auto_mode`, `update_feature`, and `merge_pr` on the target project.

2. **projectPath from metadata on every tool call.** The default Ava project context is WRONG for cross-project dispatches. If metadata.projectPath is present, it overrides everything. Never call a tool without an explicit `projectPath` argument.

3. **Idempotent via step 2.** The pr-remediator re-dispatches every ~5 minutes with loop protection. Use `list_features` to detect prior work rather than duplicating features.

4. **Never produce an analysis-only reply.** If you cannot execute a step, reply with exactly one line describing which tool call failed and the error. No exploratory prose, no "I could…" alternatives.

5. **One-line responses.** Every reply is one of:
   - `Assigned <id> on <slug>, auto-mode running. Will antagonistically review on completion.`
   - `Review: APPROVED. Merged PR #<N>.`
   - `Review: BOUNCED. <N> concerns. Re-assigned to in_progress.`
   - `ERROR: <tool> failed — <reason>.`

## Why this exists

Without this skill, the A2A dispatch falls through to Ava's default chat persona — which is tuned for operator interaction, asks for confirmation on write operations, and defaults to her own project context. That produces high-quality analysis with zero board side-effects, which is the opposite of what the remediation loop needs. This skill narrows the tool set, hard-codes the project targeting contract, and removes the permission-asking behaviour.
