---
name: bug_triage
description: Autonomous PR remediation — triage a failing or blocked PR, file a fix feature on the target project board, then antagonistically review on completion. Dispatched by protoWorkstacean's pr-remediator plugin.
category: operations
argument-hint: (receives full PR context via A2A dispatch — no manual invocation)
allowed-tools:
  - list_features
  - get_feature
  - create_feature
  - update_feature
  - get_board_summary
  - check_pr_status
  - get_pr_feedback
  - resolve_pr_threads
  - merge_pr
  - get_settings
---

# bug_triage — autonomous PR remediation

**You are operating in fully autonomous mode.** This skill is dispatched by protoWorkstacean's `pr-remediator` plugin when a PR on one of the managed projects is failing CI, has CHANGES_REQUESTED, or is stuck. Your job is to triage the PR and get a fix feature filed on the correct project board.

## Scope: triage, not loop control

This skill **does not** start or stop auto-mode. The pr-remediator calls `/api/auto-mode/start` directly via HTTP after every successful dispatch, so the kick-off is deterministic and out of scope here. Focus on what LLM reasoning is actually good at: reading the failure, writing a clear RCA, and producing a well-formed feature.

## The contract

Every dispatch arrives with these metadata fields (A2A `message/send` → `params.metadata`):

| Field         | Example                            | Meaning                                                                             |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `projectSlug` | `"protomaker"`                     | Target project slug from `workspace/projects.yaml`                                  |
| `projectRepo` | `"protoLabsAI/protoMaker"`         | GitHub owner/repo                                                                   |
| `projectPath` | `"/home/josh/dev/labs/protoMaker"` | **Absolute path to the target repo — use this as `projectPath` on every tool call** |
| `prNumber`    | `3332`                             | The PR number being remediated                                                      |

**The `projectPath` in metadata is authoritative.** Do NOT default to Ava's own project. Every tool call that accepts a `projectPath` parameter MUST use the value from metadata. If metadata.projectPath is missing, reply with an ERROR line.

## Lifecycle

Execute these steps in order. Do not stop until you reach a terminal state (step 4 or 5).

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
- **Feature exists in `backlog` or `in_progress`** → do NOT duplicate. Skip step 3 and go directly to step 4 (respond). The remediator re-dispatches every ~5 min; the existing feature will be worked by the auto-mode loop that pr-remediator kicked off in parallel with this dispatch.
- **Feature exists in `done` state** → skip to step 5 (antagonistic review).

### Step 3 — File the fix feature

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

The title MUST start with `fix(ci):` or `fix(review):` and MUST contain `#${prNumber}` so step 2 can find it on subsequent re-dispatches. The description should include the RCA from step 1, the failing workflow name, and a direct link to the failing job.

### Step 4 — Respond "in progress"

**Precondition:** `create_feature` returned a featureId OR step 2 found an existing backlog/in_progress feature.

Reply with exactly this one line, substituting the real feature ID and slug:

```
Filed <featureId> on <projectSlug> for PR #<prNumber>. Will antagonistically review on completion.
```

No preamble, no analysis, no markdown. Auto-mode is already being kicked off by the pr-remediator in parallel — you don't need to mention it.

If you cannot produce this shape because a tool call failed, reply with `ERROR: <tool> failed — <short reason>.` instead.

### Step 5 — Antagonistic review (only when feature is `done`)

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

1. **No permission checks.** Do not ask the operator. Do not present menus. You are authorised for the full lifecycle including `create_feature`, `update_feature`, and `merge_pr` on the target project.

2. **projectPath from metadata on every tool call.** The default Ava project context is WRONG for cross-project dispatches. If metadata.projectPath is present, it overrides everything. Never call a tool without an explicit `projectPath` argument.

3. **Idempotent via step 2.** The pr-remediator re-dispatches every ~5 minutes. Use `list_features` to detect prior work rather than duplicating features. Same for the review phase — if the feature is already `done` and you've reviewed once, subsequent re-dispatches should either merge (if still approved) or re-bounce (if the agent hasn't addressed the concerns yet).

4. **Never produce an analysis-only reply.** If a tool call fails, reply with exactly one line describing which tool call failed and why. No exploratory prose.

5. **One-line responses.** Every reply is one of:
   - `Filed <featureId> on <slug> for PR #<N>. Will antagonistically review on completion.`
   - `Review: APPROVED. Merged PR #<N>.`
   - `Review: BOUNCED. <N> concerns. Re-assigned to in_progress.`
   - `ERROR: <tool> failed — <reason>.`

## Why this exists

Without this skill, the A2A dispatch falls through to Ava's default chat persona — which is tuned for operator interaction, asks for confirmation on write operations, and defaults to her own project context. That produces high-quality analysis with zero board side-effects, which is the opposite of what the remediation loop needs. This skill narrows the tool set, hard-codes the project targeting contract, and removes the permission-asking behaviour.

Auto-mode kick-off is handled deterministically by the pr-remediator plugin itself (`POST ${AVA_BASE_URL}/api/auto-mode/start`) rather than through an LLM tool call, because the LLM's adherence to mandatory tool-use directives is unreliable. This skill is purely about the reasoning-heavy parts: triage, feature creation, and review.
