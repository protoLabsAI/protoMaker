# Harness Eval

The harness eval is protoMaker's measurement substrate: it runs golden pipeline scenarios through the real processors (with mocked externals) and emits an aggregate **scorecard**, so changes to the pipeline/harness can be regression-gated. This is the "treat the harness as production code, gate it on real evals" discipline (#3904) — distinct from unit tests, which assert specific behaviors rather than aggregate success rate.

## Run it

```bash
npm run eval:harness   # runs golden scenarios → apps/server/eval/scorecard.json
npm run eval:gate      # compares scorecard.json to baseline.json; exits 1 on regression
```

CI runs both on any PR that touches pipeline files (`.github/workflows/harness-eval.yml`, path-filtered to `lead-engineer-*`, processors, `libs/prompts/**`, `workflow-settings.ts`, the eval dir, and the gate script).

## Layout

| Path                                | Role                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/server/eval/scorecard.ts`     | Scorecard collector + aggregation (`record`, `buildScorecard`, `writeScorecard`)        |
| `apps/server/eval/*.eval.ts`        | Golden scenario files (real processors, mocked gh/LLM), one `record()` per scenario     |
| `apps/server/eval/baseline.json`    | Committed regression thresholds (`minSuccessRate`, `maxEscalationRate`, `minScenarios`) |
| `apps/server/eval/scorecard.json`   | Run artifact (gitignored)                                                               |
| `scripts/eval-gate.mjs`             | Reads scorecard vs baseline; non-zero exit on regression                                |
| `apps/server/vitest.eval.config.ts` | Dedicated `eval` vitest project (not run by `test:server`)                              |

## Adding a scenario

A scenario drives a real processor decision over mocked inputs and records the outcome:

```typescript
record({
  id: 'review-bot-cr-invalid-dismisses',
  domain: 'review',
  description: 'Bot CHANGES_REQUESTED judged INVALID → dismiss + re-check',
  expected: 'dismiss-recheck',
  actual, // classified from the processor result
  passed: actual === 'dismiss-recheck',
  metrics: { escalated: false },
});
```

Each scenario also `expect()`s its outcome, so a regression fails the run twice over (the assertion and the scorecard gate). As the golden set grows, tighten `baseline.json`.

## Why thresholds, not full-scorecard diff

The baseline is a small thresholds spec (`minSuccessRate` etc.), not a frozen full scorecard. This gates the metric that matters (aggregate success rate, capped escalation) without breaking on every benign scenario-count change. `successRate` is the headline; `maxEscalationRate` stops the pipeline from "passing" by escalating everything to humans.

## Roadmap

This is the keystone for the self-improving harness loop (#3905): once changes are eval-gated, the failure-miner can propose harness edits and open a PR **only if regression-clean**. See also #3906 (verifier evidence at EXECUTE exit). Current coverage: REVIEW bot-feedback audit gate (6 scenarios); expand to CI-failure remediation, approve→merge, and EXECUTE-exit domains.
