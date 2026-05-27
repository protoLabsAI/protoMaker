# Spike: Best-of-N Multi-Trajectory Sampling (architectural tier)

Investigation + recommendation for beads `26d`. **Outcome: build the cheap slice (best-of-N on PLAN) behind a default-off flag; defer best-of-N on full execution.** This is a spike — no feature shipped here; this records the design, cost model, and go/no-go so a follow-up can implement the recommended slice if greenlit.

## Idea

For the hardest features (`complexity: 'architectural'`), generate **N** candidate solutions, evaluate them, and proceed with the best — instead of a single trajectory + retry-on-failure. Factory's Code Droid does this ("multiple solution trajectories, validate against tests, select the strongest"). It trades cost for reliability on the features most likely to fail.

## Where it could hook

| Option                                         | What gets sampled                     | Cost                                         | Scoring                                             | Risk                                                 |
| ---------------------------------------------- | ------------------------------------- | -------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| **A. Best-of-N on PLAN** _(recommended first)_ | N plans from the PLAN phase           | N × one PLAN call (cheap)                    | reasoning-tier judge ranks plans vs spec/acceptance | Low — PLAN is bounded, no worktree/PR churn          |
| B. Best-of-N on EXECUTE                        | N full implementations in N worktrees | N × full agent run (expensive) + N worktrees | tests/lint/eval per candidate, pick the passing one | High — cost, worktree mgmt, partial-failure handling |

**Recommendation: start with Option A.** A weak plan is the dominant cause of a failed architectural feature ("a droid is only as good as its plan"), and sampling plans is cheap and contained. Option B (full-execution best-of-N) is a much larger, costlier build — defer until A shows lift.

## Cost model

- Gate strictly to `complexity: 'architectural'` (a small slice of features) and behind a workflow setting `bestOfN: { enabled: false, n: 3 }` (default off). Architectural features already route to the reasoning tier, so N plan calls there are the expensive ones — keep N small (3) and only for this tier.
- Never apply best-of-N to small/medium features — the cost isn't justified by their base success rate.

## Scoring (Option A)

Rank the N candidate plans with a reasoning-tier judge against the feature's spec + acceptance criteria (reuse the `simpleQuery` + structured-verdict pattern from the fresh-eyes review / `feedback-audit` prompts). Pick the top plan; record the alternatives + the choice rationale to the trajectory for observability + the eval harness.

## Validation hook

Any best-of-N change is pipeline-touching, so it's already covered by the **harness-eval CI gate** (#3904): land it behind the flag, then measure architectural-tier success rate with the flag on vs off across golden scenarios before enabling by default. This is exactly the substrate the eval harness was built for — don't enable best-of-N on a hunch, gate it on a measured lift.

## Go / no-go

**Go** on Option A as a follow-up feature (flag-gated, architectural-tier-only, plan-ranking via the reasoning judge, measured via the eval harness). **No-go** for now on Option B (full-execution best-of-N) — disproportionate cost/complexity until A proves the lift. Tracked as a follow-up; this spike (`26d`) is complete.
