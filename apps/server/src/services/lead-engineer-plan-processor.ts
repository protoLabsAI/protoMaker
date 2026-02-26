/**
 * Lead Engineer — Plan State Processor
 *
 * PlanProcessor: Generates implementation plan with knowledge-augmented context.
 * Before generating the plan, searches the knowledge store for prior plans and
 * specs related to the feature. Injects the top-3 results as context into the
 * plan generation prompt. Knowledge search is non-blocking — if unavailable or
 * returning nothing, plan generation proceeds unchanged.
 */

import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import type { KnowledgeSearchResult } from '@protolabs-ai/types';
import { buildPlanPrompt } from '@protolabs-ai/prompts';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

// ────────────────────────── PlanProcessor ──────────────────────────

/**
 * PLAN State: Agent researches codebase, produces plan. Factor-based antagonistic gate.
 * Augments the plan prompt with prior plans retrieved from the knowledge store.
 */
export class PlanProcessor implements StateProcessor {
  private readonly MAX_PLAN_RETRIES = 2;

  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[PLAN] Starting planning phase for feature: ${ctx.feature.id}`, {
      planRetryCount: ctx.planRetryCount,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const { feature } = ctx;

    // Use appropriate model for plan generation based on complexity:
    // architectural -> opus, large -> sonnet, default -> haiku
    const complexity = feature.complexity || 'medium';
    const planModel =
      complexity === 'architectural' ? 'opus' : complexity === 'large' ? 'sonnet' : 'haiku';

    logger.info(`[PLAN] Generating implementation plan via simpleQuery (${planModel})`, {
      featureId: feature.id,
      title: feature.title,
      complexity,
    });

    // Search knowledge store for prior plans (non-blocking — failures are swallowed)
    const priorPlans = await this.searchPriorPlans(ctx);
    if (priorPlans.length > 0) {
      logger.info(`[PLAN] Injecting ${priorPlans.length} prior plan(s) into prompt`);
    }

    try {
      const result = await simpleQuery({
        prompt: buildPlanPrompt(feature, priorPlans),
        model: resolveModelString(planModel),
        cwd: ctx.projectPath,
        systemPrompt:
          'You are a senior software engineer creating implementation plans. Be concise and specific.',
        maxTurns: 1,
        allowedTools: [],
      });

      ctx.planOutput = result.text;
    } catch (err) {
      logger.warn('[PLAN] simpleQuery failed, using feature description as plan', err);
      ctx.planOutput = `Feature: ${feature.title}\n\n${feature.description || 'Implement as described.'}`;
    }

    // Validate plan quality
    const gateResult = this.validatePlan(ctx);

    if (!gateResult.approved) {
      logger.warn('[PLAN] Plan validation failed', { reason: gateResult.reason });

      if (gateResult.shouldRetry && ctx.planRetryCount < this.MAX_PLAN_RETRIES) {
        ctx.planRetryCount++;
        return {
          nextState: 'PLAN',
          shouldContinue: true,
          reason: `Plan needs revision: ${gateResult.reason}`,
          context: { gateReason: gateResult.reason },
        };
      }

      ctx.escalationReason = `Plan rejected after ${ctx.planRetryCount} retries: ${gateResult.reason}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    logger.info(`[PLAN] Plan approved (${ctx.planOutput.length} chars)`);

    // Antagonistic review gate for large/architectural features
    const reviewResult = await this.antagonisticReview(ctx);
    if (reviewResult && !reviewResult.approved) {
      logger.warn('[PLAN] Antagonistic review rejected plan', { reason: reviewResult.reason });

      if (ctx.planRetryCount < this.MAX_PLAN_RETRIES) {
        ctx.planRetryCount++;
        return {
          nextState: 'PLAN',
          shouldContinue: true,
          reason: `Plan rejected by review: ${reviewResult.reason}`,
          context: { reviewFeedback: reviewResult.reason },
        };
      }

      // Max retries exceeded — proceed anyway with a warning
      logger.warn('[PLAN] Proceeding despite review rejection (max retries exceeded)');
    }

    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: 'Plan approved',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[PLAN] Planning phase completed');
  }

  /**
   * Search the knowledge store for prior plans related to this feature.
   * Returns top-3 results, or an empty array if the store is unavailable or errors.
   */
  private async searchPriorPlans(ctx: StateContext): Promise<KnowledgeSearchResult[]> {
    const { knowledgeStoreService } = this.serviceContext;
    if (!knowledgeStoreService) {
      return [];
    }

    const { feature } = ctx;
    const query = [feature.title, feature.description]
      .filter(Boolean)
      .join(' ')
      .slice(0, 500)
      .trim();

    if (!query) {
      return [];
    }

    try {
      const { results } = await knowledgeStoreService.search(ctx.projectPath, query, {
        maxResults: 3,
        sourceTypes: ['agent_output', 'reflection', 'generated'],
      });
      return results.slice(0, 3);
    } catch (err) {
      logger.warn('[PLAN] Knowledge store search failed, proceeding without prior plans', err);
      return [];
    }
  }

  /**
   * Run antagonistic review on large/architectural plans.
   * Returns null if review is skipped (small/medium features or disabled).
   */
  private async antagonisticReview(
    ctx: StateContext
  ): Promise<{ approved: boolean; reason?: string } | null> {
    const complexity = ctx.feature.complexity || 'medium';
    if (complexity !== 'large' && complexity !== 'architectural') {
      return null; // Skip for small/medium features
    }

    // Check if antagonistic review is enabled in workflow settings
    const workflowSettings = await getWorkflowSettings(
      ctx.projectPath,
      this.serviceContext.settingsService,
      '[PlanProcessor]'
    );
    if (workflowSettings.pipeline.antagonisticPlanReview === false) {
      return null; // Disabled by settings
    }

    logger.info('[PLAN] Running antagonistic review for complex feature', {
      featureId: ctx.feature.id,
      complexity,
    });

    try {
      const result = await simpleQuery({
        prompt: `You are a critical code reviewer. Evaluate this implementation plan for a ${complexity}-complexity feature.

**Feature:** ${ctx.feature.title || 'Untitled'}
**Description:** ${ctx.feature.description || 'No description'}

**Proposed Plan:**
${ctx.planOutput}

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
        cwd: ctx.projectPath,
        systemPrompt:
          'You are a senior architect reviewing implementation plans. Be critical but fair — only reject plans with genuine issues that would cause failure.',
        maxTurns: 1,
        allowedTools: [],
      });

      const response = result.text.trim();
      if (response.startsWith('APPROVED')) {
        logger.info('[PLAN] Antagonistic review approved');
        return { approved: true };
      }

      const reason = response.startsWith('REJECTED:') ? response.slice(9).trim() : response;
      return { approved: false, reason };
    } catch (err) {
      // Review failure shouldn't block the pipeline — log and approve
      logger.warn('[PLAN] Antagonistic review failed, approving by default', err);
      return null;
    }
  }

  private validatePlan(ctx: StateContext): {
    approved: boolean;
    shouldRetry: boolean;
    reason?: string;
  } {
    const plan = ctx.planOutput || '';

    // Plan must be non-empty and substantive
    if (plan.length < 100) {
      return { approved: false, shouldRetry: true, reason: 'Plan too short (<100 chars)' };
    }

    // If LLM flagged the feature as unclear
    if (plan.startsWith('UNCLEAR:')) {
      return {
        approved: false,
        shouldRetry: false,
        reason: `Feature requirements unclear: ${plan.slice(8).trim()}`,
      };
    }

    return { approved: true, shouldRetry: false };
  }
}
