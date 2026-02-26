/**
 * Lead Engineer — Intake State Processor
 *
 * IntakeProcessor: Classifies complexity, assigns persona, validates deps.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { AgentRole, Feature } from '@protolabs-ai/types';
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
