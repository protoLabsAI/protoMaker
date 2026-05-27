/**
 * Review Feedback Audit Prompt
 *
 * Builds the prompt for the reasoning-tier audit that runs in the REVIEW phase
 * when a bot reviewer (e.g. protoquinn) requests changes. The audit judges the
 * feedback against what the feature actually did — its work trajectory and the
 * real PR diff — and returns VALID / INVALID / UNCERTAIN so the pipeline can
 * remediate a real defect, dismiss a wrong/stale one, or escalate to a human
 * rather than burning the remediation budget on a phantom finding.
 *
 * Safety bias: when the audit cannot confidently adjudicate, it must return
 * UNCERTAIN (escalate), never INVALID. Dismissing a real defect risks merging
 * broken code, so the cost of a false INVALID is higher than a false UNCERTAIN.
 */

export interface FeedbackAuditInput {
  /** The bot review feedback under audit (concatenated bodies). */
  reviewFeedback: string;
  /** Reviewer logins that authored the feedback (for context). */
  reviewers: string[];
  featureTitle: string;
  featureDescription: string;
  acceptanceCriteria?: string[];
  /** Per-attempt trajectory summaries (plan + execution + outcome). */
  trajectorySummaries?: string[];
  /** The PR diff under review. */
  prDiff: string;
  /** Terminal CI status summary (e.g. "all checks passed" or named failures). */
  ciStatus?: string;
}

export type FeedbackAuditVerdict = 'VALID' | 'INVALID' | 'UNCERTAIN';

export interface FeedbackAuditResult {
  verdict: FeedbackAuditVerdict;
  rationale: string;
  raw: string;
}

export const FEEDBACK_AUDIT_SYSTEM_PROMPT =
  'You are a staff engineer auditing automated code-review feedback against the actual work a feature performed. ' +
  'Your job is NOT to re-review the PR — it is to decide whether the reviewer findings identify a real, current ' +
  'defect in this diff. Reviewers are sometimes confidently wrong (false premises about the code, stale concerns ' +
  'already addressed, or assumptions contradicted by the diff). Be rigorous and cite evidence from the diff or ' +
  'trajectory. When you cannot confidently adjudicate, return UNCERTAIN — never guess INVALID, because dismissing ' +
  'a real defect risks merging broken code.';

/**
 * Build the user prompt for a review-feedback audit.
 */
export function buildFeedbackAuditPrompt(input: FeedbackAuditInput): string {
  const criteria =
    input.acceptanceCriteria && input.acceptanceCriteria.length > 0
      ? input.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : 'No explicit criteria provided.';

  const trajectory =
    input.trajectorySummaries && input.trajectorySummaries.length > 0
      ? input.trajectorySummaries.map((t, i) => `### Attempt ${i + 1}\n${t}`).join('\n\n')
      : 'No recorded trajectory for this feature.';

  return `Audit the review feedback below against what this feature actually implemented. Decide whether the findings reflect a real, current defect in the diff.

## Feature
**Title:** ${input.featureTitle}
**Description:** ${input.featureDescription}

## Acceptance Criteria
${criteria}

## Work Trajectory (what the agent did)
${trajectory}

## CI Status
${input.ciStatus ?? 'Unknown.'}

## Review Feedback Under Audit
**Reviewer(s):** ${input.reviewers.join(', ') || 'unknown'}

${input.reviewFeedback.slice(0, 12000)}

## PR Diff
\`\`\`diff
${input.prDiff.slice(0, 20000)}
\`\`\`

Cross-check each finding against the diff and trajectory. A finding is only VALID if it points to a real defect present in THIS diff. A finding is INVALID if it rests on a false premise about the code, is contradicted by the diff, or describes something already handled. Respond with exactly one of:

VALID: [reason] — At least one finding identifies a real, current defect that must be fixed before merge.
INVALID: [reason] — The findings are wrong, stale, or already addressed; there is no real defect to fix here.
UNCERTAIN: [reason] — You cannot confidently determine whether the findings are real (e.g. needs context outside the diff, or genuinely ambiguous).

Respond with only the verdict line, the verdict keyword first, followed by one or two sentences of evidence-based reasoning.`;
}

/**
 * Parse the LLM response into a structured FeedbackAuditResult.
 * Defaults to UNCERTAIN (escalate) when the response cannot be parsed — the
 * safe direction, since UNCERTAIN routes to a human rather than dismissing.
 */
export function parseFeedbackAuditVerdict(responseText: string): FeedbackAuditResult {
  const text = responseText.trim();
  const upper = text.toUpperCase();

  if (upper.startsWith('VALID')) {
    const rationale = text.replace(/^valid\s*[:\-—]?\s*/i, '').trim();
    return { verdict: 'VALID', rationale: rationale || 'Real defect identified.', raw: text };
  }
  if (upper.startsWith('INVALID')) {
    const rationale = text.replace(/^invalid\s*[:\-—]?\s*/i, '').trim();
    return {
      verdict: 'INVALID',
      rationale: rationale || 'Findings are wrong, stale, or already addressed.',
      raw: text,
    };
  }
  if (upper.startsWith('UNCERTAIN')) {
    const rationale = text.replace(/^uncertain\s*[:\-—]?\s*/i, '').trim();
    return {
      verdict: 'UNCERTAIN',
      rationale: rationale || 'Could not confidently adjudicate the findings.',
      raw: text,
    };
  }

  return {
    verdict: 'UNCERTAIN',
    rationale: `Audit response could not be parsed: ${text.slice(0, 200)}`,
    raw: text,
  };
}
