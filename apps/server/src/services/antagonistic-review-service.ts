/**
 * AntagonisticReviewService - Orchestrates sequential Ava + Jon PRD review
 *
 * Executes a 3-stage review pipeline:
 * 1. Ava reviews for operational feasibility (capacity, risk, technical debt)
 * 2. Jon reviews for market value (customer impact, ROI, positioning) with access to Ava's critique
 * 3. Resolution agent (Ava as CoS) merges verdicts into consolidated PRD
 *
 * Must complete in < 3 minutes.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SPARCPrd, StructuredPlan } from '@protolabsai/types';
import type { ReviewResult, ConsolidatedReview, ReviewRequest } from '@protolabsai/types';
import { extractPRDFromText } from '@protolabsai/types';
import { AntagonisticReviewAdapter } from './antagonistic-review-adapter.js';
import { getLangfuseInstance } from '../lib/langfuse-singleton.js';
import type { SettingsService } from './settings-service.js';
import { resolveModelString } from '@protolabsai/model-resolver';
import { simpleQuery } from '../providers/simple-query-service.js';
import { getAvaPrompt, getJonPrompt } from '@protolabsai/prompts';

const logger = createLogger('AntagonisticReview');

const REVIEW_TIMEOUT_MS = 180_000; // 3 minutes

export class AntagonisticReviewService {
  private static instance: AntagonisticReviewService;
  private events: EventEmitter;
  private settingsService: SettingsService;
  private adapter: AntagonisticReviewAdapter | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(events: EventEmitter, settingsService: SettingsService) {
    this.events = events;
    this.settingsService = settingsService;
  }

  /**
   * Ensure Langfuse is initialized before use (lazy, once)
   */
  private ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeLangfuse();
    }
    return this.initPromise;
  }

  /**
   * Initialize Langfuse client and adapter
   */
  private async initializeLangfuse(): Promise<void> {
    try {
      const langfuseClient = getLangfuseInstance();

      if (langfuseClient.isAvailable()) {
        this.adapter = new AntagonisticReviewAdapter({
          smartModel: resolveModelString('sonnet'),
          enableHITL: false,
          langfuseClient,
        });

        logger.info('Langfuse tracing initialized for antagonistic reviews');
      } else {
        logger.info('Langfuse not available, tracing disabled for antagonistic reviews');
      }
    } catch (error) {
      logger.error('Failed to initialize Langfuse:', error);
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    events: EventEmitter,
    settingsService: SettingsService
  ): AntagonisticReviewService {
    if (!AntagonisticReviewService.instance) {
      AntagonisticReviewService.instance = new AntagonisticReviewService(events, settingsService);
    }
    return AntagonisticReviewService.instance;
  }

  /**
   * Execute the full antagonistic review pipeline
   */
  async executeReview(request: ReviewRequest): Promise<ConsolidatedReview> {
    // Ensure Langfuse is initialized before checking adapter availability
    await this.ensureInitialized();

    const startTime = Date.now();
    const { prd, prdId, projectPath } = request;

    logger.info(`Starting antagonistic review for PRD: ${prdId}`);

    // Emit review started event
    this.events.emit('prd:review:started', {
      prdId,
      projectPath,
      timestamp: new Date().toISOString(),
    });

    // Check if useGraphFlows feature flag is enabled
    const settings = await this.settingsService.getGlobalSettings();
    const useGraphFlows = settings.useGraphFlows ?? true; // Default to true

    // If feature flag is enabled and adapter is available, use the new flow
    if (useGraphFlows && this.adapter) {
      logger.info('Using LangGraph flow for antagonistic review');
      const result = await this.adapter.executeReview(request);

      // Emit review completed event for backward compatibility
      this.events.emit('prd:review:completed', {
        prdId,
        projectPath,
        totalDurationMs: result.totalDurationMs,
        totalCost: result.totalCost,
        traceId: result.traceId,
        success: result.success,
        error: result.error,
        timestamp: new Date().toISOString(),
      });

      return result;
    }

    // Otherwise, fall back to direct simpleQuery implementation
    logger.info('Using simpleQuery for antagonistic review');

    try {
      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn(`Review timeout after ${REVIEW_TIMEOUT_MS}ms for PRD ${prdId}`);
      }, REVIEW_TIMEOUT_MS);

      try {
        // Stage 1: Ava reviews for operational feasibility
        const avaReview = await this.executeAvaReview(prd, prdId, projectPath, abortController);

        if (!avaReview.success) {
          throw new Error(`Ava review failed: ${avaReview.error}`);
        }

        // Stage 2: Jon reviews for market value (with access to Ava's critique)
        const jonReview = await this.executeJonReview(
          prd,
          avaReview,
          prdId,
          projectPath,
          abortController
        );

        if (!jonReview.success) {
          throw new Error(`Jon review failed: ${jonReview.error}`);
        }

        // Stage 3: Resolution - Ava as CoS merges verdicts
        const resolution = await this.executeResolution(
          prd,
          avaReview,
          jonReview,
          prdId,
          projectPath,
          abortController
        );

        const totalDurationMs = Date.now() - startTime;

        logger.info(`Antagonistic review completed in ${totalDurationMs}ms for PRD ${prdId}`);

        // Emit review completed event
        this.events.emit('prd:review:completed', {
          prdId,
          projectPath,
          totalDurationMs,
          success: true,
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          avaReview,
          jonReview,
          resolution: resolution.output,
          finalPRD: extractPRDFromText(resolution.output, prd),
          totalDurationMs,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Antagonistic review failed for PRD ${prdId}: ${errorMessage}`);

      // Emit review completed event with error
      this.events.emit('prd:review:completed', {
        prdId,
        projectPath,
        totalDurationMs,
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        avaReview: {
          success: false,
          reviewer: 'ava',
          verdict: '',
          durationMs: 0,
          error: errorMessage,
        },
        jonReview: {
          success: false,
          reviewer: 'jon',
          verdict: '',
          durationMs: 0,
          error: errorMessage,
        },
        resolution: '',
        totalDurationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Resume a review that was paused for HITL input
   */
  async resumeReview(threadId: string, hitlFeedback: string): Promise<ConsolidatedReview> {
    await this.ensureInitialized();

    if (!this.adapter) {
      throw new Error('Flow adapter not available — cannot resume review');
    }

    logger.info(`Resuming review for thread ${threadId}`);
    return this.adapter.resumeReview(threadId, hitlFeedback);
  }

  /**
   * Stage 1: Ava reviews for operational feasibility
   */
  private async executeAvaReview(
    prd: SPARCPrd,
    prdId: string,
    projectPath: string,
    abortController: AbortController
  ): Promise<ReviewResult> {
    const startTime = Date.now();

    logger.info('Stage 1: Ava reviewing for operational feasibility');

    try {
      const prompt = this.buildAvaPrompt(prd);
      const systemPrompt = getAvaPrompt({});

      const result = await simpleQuery({
        prompt,
        model: resolveModelString('opus'),
        cwd: projectPath,
        systemPrompt,
        maxTurns: 10,
        allowedTools: [],
        abortController,
        traceContext: { agentRole: 'ava-reviewer', featureId: prdId },
      });

      const durationMs = Date.now() - startTime;

      // Parse Ava's output to extract concerns and recommendations
      const { concerns, recommendations } = this.parseReviewOutput(result.text);

      return {
        success: true,
        reviewer: 'ava',
        verdict: result.text,
        concerns,
        recommendations,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Ava review failed: ${errorMessage}`);

      return {
        success: false,
        reviewer: 'ava',
        verdict: '',
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Stage 2: Jon reviews for market value
   */
  private async executeJonReview(
    prd: SPARCPrd,
    avaReview: ReviewResult,
    prdId: string,
    projectPath: string,
    abortController: AbortController
  ): Promise<ReviewResult> {
    const startTime = Date.now();

    logger.info('Stage 2: Jon reviewing for market value');

    try {
      const prompt = this.buildJonPrompt(prd, avaReview);
      const systemPrompt = getJonPrompt({});

      const result = await simpleQuery({
        prompt,
        model: resolveModelString('sonnet'),
        cwd: projectPath,
        systemPrompt,
        maxTurns: 10,
        allowedTools: [],
        abortController,
        traceContext: { agentRole: 'jon-reviewer', featureId: prdId },
      });

      const durationMs = Date.now() - startTime;

      // Parse Jon's output to extract concerns and recommendations
      const { concerns, recommendations } = this.parseReviewOutput(result.text);

      return {
        success: true,
        reviewer: 'jon',
        verdict: result.text,
        concerns,
        recommendations,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Jon review failed: ${errorMessage}`);

      return {
        success: false,
        reviewer: 'jon',
        verdict: '',
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Stage 3: Resolution - Ava as CoS merges verdicts
   */
  private async executeResolution(
    prd: SPARCPrd,
    avaReview: ReviewResult,
    jonReview: ReviewResult,
    prdId: string,
    projectPath: string,
    abortController: AbortController
  ): Promise<{ success: boolean; output: string; error?: string }> {
    logger.info('Stage 3: Resolution - merging verdicts into consolidated PRD');

    try {
      const prompt = this.buildResolutionPrompt(prd, avaReview, jonReview);
      const systemPrompt = getAvaPrompt({});

      const result = await simpleQuery({
        prompt,
        model: resolveModelString('opus'),
        cwd: projectPath,
        systemPrompt,
        maxTurns: 10,
        allowedTools: [],
        abortController,
        traceContext: { agentRole: 'ava-resolution', featureId: prdId },
      });

      return {
        success: true,
        output: result.text,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Resolution failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Build Ava's review prompt focusing on operational feasibility
   */
  private buildAvaPrompt(prd: SPARCPrd): string {
    return `You are Ava, the Chief of Staff. Review this PRD for operational feasibility.

**PRD to Review:**

**Situation:** ${prd.situation}

**Problem:** ${prd.problem}

**Approach:** ${prd.approach}

**Results:** ${prd.results}

**Constraints:** ${prd.constraints || 'None specified'}

---

**Your Task:**

Review this PRD from an operational perspective. Assess:

1. **Capacity**: Do we have the resources, time, and team capacity to execute this?
2. **Risk**: What technical, operational, or execution risks exist?
3. **Technical Debt**: Will this create technical debt or maintenance burden?
4. **Feasibility**: Is the approach technically sound and achievable?

**Output Format:**

Provide your review as structured text with:

## Operational Assessment

[Your overall assessment]

## Concerns

- [List specific concerns, if any]

## Recommendations

- [List recommendations for improvement]

## Verdict

[APPROVE / APPROVE_WITH_CONDITIONS / REJECT]

Be candid and thorough. Your role is to ensure we don't commit to something we cannot deliver.`;
  }

  /**
   * Build Jon's review prompt focusing on market value
   */
  private buildJonPrompt(prd: SPARCPrd, avaReview: ReviewResult): string {
    return `You are Jon, the CEO. Review this PRD for market value and strategic fit.

**PRD to Review:**

**Situation:** ${prd.situation}

**Problem:** ${prd.problem}

**Approach:** ${prd.approach}

**Results:** ${prd.results}

**Constraints:** ${prd.constraints || 'None specified'}

---

**Ava's Operational Review:**

${avaReview.verdict}

---

**Your Task:**

Review this PRD from a market and strategic perspective. You have seen Ava's operational concerns. Now assess:

1. **Customer Impact**: How does this benefit our customers? What's the value proposition?
2. **ROI**: What's the expected return on investment? Is this worth the effort?
3. **Positioning**: Does this align with our strategic direction and market positioning?
4. **Priority**: How does this compare to other opportunities?

**Output Format:**

Provide your review as structured text with:

## Market Assessment

[Your overall assessment]

## Concerns

- [List specific concerns, if any]

## Recommendations

- [List recommendations for improvement]

## Verdict

[APPROVE / APPROVE_WITH_CONDITIONS / REJECT]

Consider Ava's operational concerns but focus on the market and strategic value. Be honest about whether this is worth pursuing.`;
  }

  /**
   * Build resolution prompt for Ava to merge verdicts
   */
  private buildResolutionPrompt(
    prd: SPARCPrd,
    avaReview: ReviewResult,
    jonReview: ReviewResult
  ): string {
    return `You are Ava, the Chief of Staff. Synthesize the reviews into a consolidated PRD.

**Original PRD:**

**Situation:** ${prd.situation}

**Problem:** ${prd.problem}

**Approach:** ${prd.approach}

**Results:** ${prd.results}

**Constraints:** ${prd.constraints || 'None specified'}

---

**Your Operational Review:**

${avaReview.verdict}

---

**Jon's Market Review:**

${jonReview.verdict}

---

**Your Task:**

As Chief of Staff, merge both perspectives into a consolidated PRD. Incorporate:

- Operational feasibility concerns and recommendations
- Market value and strategic considerations
- Any required adjustments to approach or constraints
- Final decision on whether to proceed

**Output Format:**

Provide the consolidated PRD in SPARC format:

## Consolidated PRD

### Situation
[Updated situation context]

### Problem
[Updated problem statement]

### Approach
[Updated approach incorporating feedback]

### Results
[Updated expected results]

### Constraints
[Updated constraints]

### Final Decision

[PROCEED / PROCEED_WITH_MODIFICATIONS / REJECT]

### Rationale

[Explanation of the final decision considering both reviews]

Be clear, concise, and actionable. This is the final PRD that will guide implementation.`;
  }

  /**
   * Parse review output to extract concerns and recommendations
   */
  private parseReviewOutput(output: string): {
    concerns?: string[];
    recommendations?: string[];
  } {
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Simple parsing: look for "## Concerns" and "## Recommendations" sections
    const concernsMatch = output.match(/## Concerns\s+([\s\S]*?)(?=##|$)/);
    const recsMatch = output.match(/## Recommendations\s+([\s\S]*?)(?=##|$)/);

    if (concernsMatch) {
      const items = concernsMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*'))
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter((line) => line.length > 0);
      concerns.push(...items);
    }

    if (recsMatch) {
      const items = recsMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*'))
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter((line) => line.length > 0);
      recommendations.push(...items);
    }

    return {
      concerns: concerns.length > 0 ? concerns : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  /**
   * Verify an implementation plan using antagonistic review.
   * Used by PlanProcessor to gate plan quality for medium+ complexity features.
   *
   * When a structured plan is provided, runs a 3-level goal-backward check:
   * 1. Truths: What must be TRUE for the feature goal to be achieved?
   * 2. Artifacts: What must EXIST (files, functions, types) for those truths to hold?
   * 3. Wiring: What must be WIRED (imports, registrations, handlers) for those artifacts to function?
   *
   * Returns { approved, reason, coveragePercent, gaps } if a verdict was reached,
   * or null if review was skipped/failed (callers should approve by default on null).
   */
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
