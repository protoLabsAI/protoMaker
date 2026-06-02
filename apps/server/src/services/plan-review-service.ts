/**
 * PlanReviewService — gates feature implementation plans before EXECUTE.
 *
 * Used by the Lead Engineer PLAN phase (via the IPlanReviewService contract) to
 * stress-test a plan for large/architectural features. Two paths:
 *   - Goal-backward verification when a StructuredPlan is available (truths →
 *     artifacts → wiring coverage analysis).
 *   - A standard critical-review pass otherwise.
 *
 * Pure plan review: no PRD pipeline, no multi-agent graph, no external agents.
 */

import { createLogger } from '@protolabsai/utils';
import type { StructuredPlan } from '@protolabsai/types';
import { resolveModelString } from '@protolabsai/model-resolver';
import { simpleQuery } from '../providers/simple-query-service.js';

const logger = createLogger('PlanReview');

export class PlanReviewService {
  private static instance: PlanReviewService;

  /**
   * Get singleton instance.
   */
  static getInstance(): PlanReviewService {
    if (!PlanReviewService.instance) {
      PlanReviewService.instance = new PlanReviewService();
    }
    return PlanReviewService.instance;
  }

  async verifyPlan(params: {
    featureTitle: string;
    featureDescription: string;
    complexity: string;
    planOutput: string;
    projectPath: string;
    structuredPlan?: StructuredPlan;
  }): Promise<{
    approved: boolean;
    reason?: string;
    coveragePercent?: number;
    gaps?: string[];
  } | null> {
    const {
      featureTitle,
      featureDescription,
      complexity,
      planOutput,
      projectPath,
      structuredPlan,
    } = params;

    logger.info('[verifyPlan] Running plan review', {
      featureTitle,
      complexity,
      hasStructuredPlan: !!structuredPlan,
    });

    // Goal-backward verification path when structured plan is available
    if (structuredPlan) {
      return this.verifyPlanGoalBackward({
        featureTitle,
        featureDescription,
        complexity,
        planOutput,
        projectPath,
        structuredPlan,
      });
    }

    // Standard review path (no structured plan)
    try {
      const result = await simpleQuery({
        prompt: `You are a critical code reviewer. Evaluate this implementation plan for a ${complexity}-complexity feature.

**Feature:** ${featureTitle}
**Description:** ${featureDescription}

**Proposed Plan:**
${planOutput}

Review the plan for:
1. Missing error handling or edge cases
2. Architectural risks (circular dependencies, monolithic changes)
3. Missing test strategy
4. Files that should be modified but aren't mentioned
5. Overly complex approach where simpler exists

If the plan is solid, respond with: APPROVED
If critical issues exist, respond with: REJECTED: [concise reason]
Minor suggestions don't warrant rejection — only reject for issues that would cause implementation failure.`,
        model: resolveModelString('haiku'),
        cwd: projectPath,
        systemPrompt:
          'You are a senior architect reviewing implementation plans. Be critical but fair — only reject plans with genuine issues that would cause failure.',
        maxTurns: 1,
        allowedTools: [],
      });

      const response = result.text.trim();
      if (response.startsWith('APPROVED')) {
        logger.info('[verifyPlan] Plan approved');
        return { approved: true };
      }

      const reason = response.startsWith('REJECTED:') ? response.slice(9).trim() : response;
      logger.info('[verifyPlan] Plan rejected', { reason });
      return { approved: false, reason };
    } catch (err) {
      logger.warn('[verifyPlan] Review failed, approving by default', err);
      return null;
    }
  }

  /**
   * Run 3-level goal-backward verification against a structured plan.
   * Identifies truths required, artifacts required, wiring required,
   * then compares against the plan's tasks to find coverage gaps.
   */
  private async verifyPlanGoalBackward(params: {
    featureTitle: string;
    featureDescription: string;
    complexity: string;
    planOutput: string;
    projectPath: string;
    structuredPlan: StructuredPlan;
  }): Promise<{
    approved: boolean;
    reason?: string;
    coveragePercent?: number;
    gaps?: string[];
  } | null> {
    const {
      featureTitle,
      featureDescription,
      complexity,
      planOutput,
      projectPath,
      structuredPlan,
    } = params;

    const taskSummary = structuredPlan.tasks
      .map(
        (t, i) =>
          `${i + 1}. ${t.title}: ${t.description} (files: ${(t.files ?? []).join(', ') || 'unspecified'})`
      )
      .join('\n');

    const criteriaList = structuredPlan.acceptanceCriteria
      .map((c, i) => `${i + 1}. ${c.description}`)
      .join('\n');

    try {
      const result = await simpleQuery({
        prompt: `You are a critical architect performing a goal-backward verification of an implementation plan.

**Feature Goal:** ${structuredPlan.goal}
**Feature Title:** ${featureTitle}
**Feature Description:** ${featureDescription}
**Complexity:** ${complexity}

**Acceptance Criteria:**
${criteriaList}

**Plan Tasks:**
${taskSummary}

**Full Plan Text:**
${planOutput}

Perform a 3-level goal-backward analysis:

## Level 1 — Truths Required
List what must be TRUE for the feature goal to be achieved (functional requirements, invariants, behavioral guarantees).

## Level 2 — Artifacts Required
For each truth, list what must EXIST: specific files to create/modify, functions to add, types to define, interfaces to implement.

## Level 3 — Wiring Required
For each artifact, list what must be WIRED: imports added, service registrations, route handlers mounted, event subscriptions registered, exports added to index files.

## Coverage Analysis
Compare the truths, artifacts, and wiring against the plan's tasks. For each requirement, note whether it is COVERED or MISSING in the plan.

## Summary
Respond with a JSON block at the end:
\`\`\`json
{
  "coveragePercent": <0-100>,
  "gaps": ["<gap description>", ...],
  "verdict": "APPROVED" | "REJECTED",
  "reason": "<concise reason if rejected, or empty string if approved>"
}
\`\`\`

Only reject if critical gaps exist that would cause implementation failure. Coverage below 70% warrants rejection.`,
        model: resolveModelString('haiku'),
        cwd: projectPath,
        systemPrompt:
          'You are a senior architect performing goal-backward plan verification. Be thorough but fair.',
        maxTurns: 1,
        allowedTools: [],
      });

      const text = result.text;

      // Extract JSON summary block
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
      if (!jsonMatch) {
        logger.warn(
          '[verifyPlan] Goal-backward review returned no JSON summary, approving by default'
        );
        return { approved: true };
      }

      let summary: { coveragePercent: number; gaps: string[]; verdict: string; reason: string };
      try {
        summary = JSON.parse(jsonMatch[1].trim());
      } catch {
        logger.warn(
          '[verifyPlan] Failed to parse goal-backward JSON summary, approving by default'
        );
        return { approved: true };
      }

      const coveragePercent =
        typeof summary.coveragePercent === 'number' ? summary.coveragePercent : 100;
      const gaps = Array.isArray(summary.gaps) ? summary.gaps : [];
      const approved = summary.verdict === 'APPROVED';
      const reason = summary.reason || undefined;

      logger.info('[verifyPlan] Goal-backward review complete', {
        coveragePercent,
        gapCount: gaps.length,
        approved,
      });

      return { approved, reason, coveragePercent, gaps };
    } catch (err) {
      logger.warn('[verifyPlan] Goal-backward review failed, approving by default', err);
      return null;
    }
  }
}
