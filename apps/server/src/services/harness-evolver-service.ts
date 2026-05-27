/**
 * Harness-evolver proposer (beads protomaker-2fq / #3905).
 *
 * Reads the failure-mode taxonomy (2u4) and proposes a concrete harness/prompt/
 * context improvement targeting the top recurring failure category. This is the
 * *proposal* step only — it does NOT apply anything. The eval-gated auto-PR step
 * (39l) consumes a proposal, applies the edit in a worktree, evals it against the
 * harness, and opens a PR only if regression-clean.
 *
 * Pure: pass a taxonomy; no I/O.
 */

import type { FailureTaxonomy } from './failure-taxonomy-service.js';

export interface HarnessProposal {
  /** The failure category this proposal targets. */
  category: string;
  count: number;
  pct: number;
  /** Why this is happening (the leading hypothesis for the category). */
  hypothesis: string;
  /** Where a fix most likely lives (file/subsystem hint for the applier). */
  suggestedTarget: string;
  /** Human-readable rationale incl. the share of failures. */
  rationale: string;
  /** Representative failing features for the category. */
  examples: Array<{ featureId: string; title?: string; reason: string }>;
}

/**
 * Per-category remediation knowledge. Maps the classifier's failure categories
 * to a leading hypothesis + the subsystem a fix most likely touches. Keep this
 * the single place that encodes "what tends to fix category X".
 */
const REMEDIATION_MAP: Record<string, { hypothesis: string; target: string }> = {
  merge_conflict: {
    hypothesis:
      'Feature worktrees drift behind origin/<base>, so the pre-flight/merge conflicts. Strengthen the pre-flight rebase / ensureCleanMergeState path.',
    target: 'lead-engineer-execute-processor.ts pre-flight + libs/git-utils rebase',
  },
  quota: {
    hypothesis:
      'Model usage/budget limits are exhausted mid-run. Tune the model tier per complexity or the remediation/concurrency budget, and ensure clean pause-and-resume.',
    target: 'model hierarchy (DEFAULT_MODELS) + RemediationBudgetEnforcer + concurrency',
  },
  rate_limit: {
    hypothesis:
      'Gateway/API throttling. Apply exponential backoff and stagger dispatch (workflow stagger setting).',
    target: 'structured retry policy + FeatureScheduler dispatch stagger',
  },
  test_failure: {
    hypothesis:
      'Agents ship diffs whose tests fail. Enable requireVerificationEvidence (zg4) for this project so failing diffs are caught before REVIEW.',
    target: 'WorkflowSettings.requireVerificationEvidence + EXECUTE verifier gate',
  },
  tool_error: {
    hypothesis:
      'Agents misuse tools (bad args / wrong tool). Tighten MCP tool schemas and per-role allowlists.',
    target: 'packages/mcp-server/src/tools/*.ts schemas + per-role allowlists',
  },
  authentication: {
    hypothesis:
      'Gateway/credential failures (e.g. 401, key-not-allowed). Verify gateway routing + the API key wiring.',
    target: 'providers/proto-provider gateway config + credential env',
  },
  dependency: {
    hypothesis:
      'Cross-repo or package dependencies block execution. Check externalDependencies gating and auto-install in pre-flight.',
    target: 'dependency resolver + cross-repo dependency gating',
  },
  validation: {
    hypothesis:
      'Feature inputs are underspecified, so the agent flails. Strengthen INTAKE enrichment / acceptance-criteria generation.',
    target: 'INTAKE phase description enrichment',
  },
  transient: {
    hypothesis:
      'Network/timeout flakiness. Increase retry backoff and timeouts for transient errors.',
    target: 'structured retry policy / timeouts',
  },
  retry_exhausted: {
    hypothesis:
      'Agents burn all retries without converging — usually a deeper unaddressed cause. Inspect the example reasons; the real category may be mis-classified.',
    target: 'FailureClassifierService patterns + the underlying category fix',
  },
  unknown: {
    hypothesis:
      'These failures are unclassified — the classifier has no pattern for them. Add patterns to FailureClassifierService so they bucket into an actionable category.',
    target: 'failure-classifier-service.ts FAILURE_PATTERNS',
  },
};

export interface ProposeOptions {
  /** Minimum failures in the top category to propose (avoid acting on noise). @default 2 */
  minCount?: number;
}

/**
 * Propose a harness improvement for the top failure category, or null when
 * there is nothing actionable (no failures, or the top category is below the
 * noise threshold).
 */
export function proposeHarnessImprovement(
  taxonomy: FailureTaxonomy,
  opts: ProposeOptions = {}
): HarnessProposal | null {
  const minCount = opts.minCount ?? 2;
  const top = taxonomy.byCategory[0];
  if (!top || top.count < minCount) return null;

  const remediation = REMEDIATION_MAP[top.category] ?? REMEDIATION_MAP.unknown;
  return {
    category: top.category,
    count: top.count,
    pct: top.pct,
    hypothesis: remediation.hypothesis,
    suggestedTarget: remediation.target,
    rationale: `"${top.category}" is the top failure mode: ${top.count} of ${taxonomy.failed} failed features (${top.pct}%). ${remediation.hypothesis}`,
    examples: top.examples,
  };
}
