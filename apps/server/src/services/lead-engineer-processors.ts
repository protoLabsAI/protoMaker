/**
 * Lead Engineer — Intake and Plan State Processors
 *
 * IntakeProcessor: Classifies complexity, assigns persona, validates deps.
 * PlanProcessor:   Generates implementation plan, runs antagonistic review.
 */

import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import type { AgentRole, Feature } from '@protolabs-ai/types';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

// ────────────────────────── IntakeProcessor ──────────────────────────

/**
 * INTAKE State: Load feature, classify complexity, assign persona, validate deps
 */
export class IntakeProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[INTAKE] Processing feature: ${ctx.feature.id}`, {
      title: ctx.feature.title,
      complexity: ctx.feature.complexity,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const { feature } = ctx;

    // Validate dependencies against real feature state
    if (feature.dependencies && feature.dependencies.length > 0) {
      const allFeatures = await this.serviceContext.featureLoader.getAll(ctx.projectPath);
      const unmetDeps: string[] = [];

      for (const depId of feature.dependencies) {
        const dep = allFeatures.find((f) => f.id === depId);
        if (!dep || (dep.status !== 'done' && dep.status !== 'verified')) {
          unmetDeps.push(depId);
        }
      }

      if (unmetDeps.length > 0) {
        ctx.escalationReason = `Unmet dependencies: ${unmetDeps.join(', ')}`;
        logger.warn(`[INTAKE] Feature has ${unmetDeps.length} unmet dependencies`, {
          featureId: feature.id,
          unmetDeps,
        });
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

      logger.info(`[INTAKE] All ${feature.dependencies.length} dependencies satisfied`);
    }

    // Classify complexity if not already set
    if (!feature.complexity) {
      ctx.feature.complexity = 'medium';
      logger.info('[INTAKE] Assigned default complexity: medium');
    }

    // Assign persona based on feature domain
    ctx.assignedPersona = this.assignPersona(feature);
    logger.info(`[INTAKE] Assigned persona: ${ctx.assignedPersona}`);

    // Determine if PLAN phase is needed
    ctx.planRequired = this.requiresPlan(feature);

    // Mark feature as in_progress on the board and persist complexity
    await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
      status: 'in_progress',
      complexity: ctx.feature.complexity,
    });
    logger.info('[INTAKE] Feature status updated to in_progress');

    if (ctx.planRequired) {
      logger.info('[INTAKE] Feature requires PLAN phase');
      return {
        nextState: 'PLAN',
        shouldContinue: true,
        reason: 'Complex feature requires planning',
      };
    }

    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: 'Simple feature, skip planning',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[INTAKE] Completed intake processing');
  }

  private assignPersona(feature: Feature): AgentRole {
    const title = feature.title?.toLowerCase() || '';
    const description = feature.description?.toLowerCase() || '';

    if (title.includes('test') || description.includes('test')) {
      return 'qa-engineer';
    }
    if (title.includes('docs') || description.includes('documentation')) {
      return 'docs-engineer';
    }
    if (title.includes('ui') || title.includes('frontend') || description.includes('component')) {
      return 'frontend-engineer';
    }
    if (title.includes('api') || title.includes('backend') || description.includes('service')) {
      return 'backend-engineer';
    }
    if (
      title.includes('deploy') ||
      title.includes('ci') ||
      description.includes('infrastructure')
    ) {
      return 'devops-engineer';
    }
    if (feature.complexity === 'architectural') {
      return 'engineering-manager';
    }

    return 'backend-engineer';
  }

  private requiresPlan(feature: Feature): boolean {
    if (feature.complexity === 'architectural') return true;
    if (feature.complexity === 'large') return true;
    const filesToModify = (feature as { filesToModify?: string[] }).filesToModify;
    if (filesToModify && filesToModify.length >= 3) return true;
    return false;
  }
}

// ────────────────────────── PlanProcessor ──────────────────────────

/**
 * PLAN State: Agent researches codebase, produces plan. Factor-based antagonistic gate.
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

    try {
      const result = await simpleQuery({
        prompt: `Create a concise implementation plan for this feature.

**Title:** ${feature.title || 'Untitled'}
**Description:** ${feature.description || 'No description provided'}
**Complexity:** ${feature.complexity || 'medium'}

Produce a plan with:
1. Key files to modify or create
2. Implementation steps (ordered)
3. Testing approach
4. Risk areas or edge cases

Keep it focused and actionable. If the feature description is too vague or unclear to plan, respond with "UNCLEAR:" followed by what's missing.`,
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

    // Save PLAN handoff before transitioning to EXECUTE
    if (this.serviceContext.leadHandoffService && ctx.planOutput) {
      await this.serviceContext.leadHandoffService.saveHandoff(ctx.projectPath, ctx.feature.id, {
        phase: 'PLAN',
        summary: ctx.planOutput.slice(0, 500),
        discoveries: [],
        modifiedFiles: [],
        outstandingQuestions: [],
        scopeLimits: [],
        testCoverage: 'N/A — plan phase',
        verdict: reviewResult && !reviewResult.approved ? 'WARN' : 'APPROVE',
        createdAt: new Date().toISOString(),
      });
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
