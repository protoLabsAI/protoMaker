/**
 * Lead Engineer — Deploy State Processor
 *
 * Verifies feature is marked done after merge, generates a reflection,
 * and saves trajectory data.
 */

import path from 'node:path';
import { createLogger } from '@protolabs-ai/utils';
import { getFeatureDir } from '@protolabs-ai/platform';
import type { EventType } from '@protolabs-ai/types';
import { simpleQuery } from '../providers/simple-query-service.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

/**
 * DEPLOY State: Verify feature is marked done after merge.
 */
export class DeployProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[DEPLOY] Deployment verification for feature: ${ctx.feature.id}`);
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Reload feature to verify final status
    const fresh = await this.serviceContext.featureLoader.get(ctx.projectPath, ctx.feature.id);
    if (fresh) ctx.feature = fresh;

    if (fresh && fresh.status !== 'done' && fresh.status !== 'verified') {
      await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
        status: 'done',
      });
      logger.info(`[DEPLOY] Updated feature status to done`);
    }

    // Emit completion event (board janitor and other listeners use this)
    this.serviceContext.events.emit('feature:completed' as EventType, {
      featureId: ctx.feature.id,
      projectPath: ctx.projectPath,
      prNumber: ctx.prNumber,
      source: 'lead_engineer_deploy',
    });

    // Checkpoint cleanup is handled by FeatureStateMachine post-loop

    // Log final cost summary
    const finalCost = ctx.feature.costUsd || 0;
    logger.info(`[DEPLOY] Feature ${ctx.feature.id} completed`, {
      title: ctx.feature.title,
      costUsd: finalCost,
      retryCount: ctx.retryCount,
      remediationAttempts: ctx.remediationAttempts,
    });

    // Fire-and-forget reflection (non-blocking)
    void this.generateReflection(ctx);

    return {
      nextState: null,
      shouldContinue: false,
      reason: 'Feature deployed and verified',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[DEPLOY] Deployment verification completed');
  }

  private async generateReflection(ctx: StateContext): Promise<void> {
    try {
      const featureDir = getFeatureDir(ctx.projectPath, ctx.feature.id);
      const fs = await import('node:fs/promises');

      // Read agent output tail for outcome context
      let agentOutputTail = '';
      try {
        const full = await fs.readFile(path.join(featureDir, 'agent-output.md'), 'utf-8');
        agentOutputTail = full.length > 2000 ? full.slice(-2000) : full;
      } catch {
        /* no output file */
      }

      const summary = [
        `Feature: ${ctx.feature.title}`,
        `Cost: $${(ctx.feature.costUsd || 0).toFixed(2)}`,
        `Retries: ${ctx.retryCount} | Remediation cycles: ${ctx.remediationAttempts}`,
        ctx.reviewFeedback ? `PR feedback received: ${ctx.reviewFeedback.slice(0, 500)}` : '',
        `Execution history: ${JSON.stringify(
          ctx.feature.executionHistory?.map((e) => ({
            model: e.model,
            success: e.success,
            durationMs: e.durationMs,
            costUsd: e.costUsd,
          })) || []
        )}`,
        agentOutputTail ? `\nAgent output (tail):\n${agentOutputTail}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const result = await simpleQuery({
        prompt: `You are a concise engineering retrospective analyst. Given this feature's execution data, write a brief reflection (under 200 words) covering:
1. **Outcome**: What was built, success or partial success
2. **Efficiency**: Cost/retry count reasonable? Wasted cycles?
3. **Lessons**: 1-2 specific, actionable takeaways for the next feature
4. **Pitfalls**: Anything the next agent should avoid
Be specific. No generic advice.

Feature Data:
${summary}`,
        model: 'haiku',
        cwd: ctx.projectPath,
        maxTurns: 1,
        allowedTools: [],
        traceContext: {
          featureId: ctx.feature.id,
          featureName: ctx.feature.title,
          agentRole: 'reflection',
        },
      });

      const content = `# Reflection: ${ctx.feature.title}\n\n_Generated: ${new Date().toISOString()}_\n_Cost: $${(ctx.feature.costUsd || 0).toFixed(2)} | Retries: ${ctx.retryCount} | Remediation: ${ctx.remediationAttempts}_\n\n${result.text}\n`;
      const reflectionPath = path.join(featureDir, 'reflection.md');
      await fs.writeFile(reflectionPath, content, 'utf-8');

      this.serviceContext.events.emit('feature:reflection:complete' as EventType, {
        featureId: ctx.feature.id,
        projectPath: ctx.projectPath,
        reflectionPath,
      });
      logger.info(`[DEPLOY] Reflection generated for feature ${ctx.feature.id}`);
    } catch (err) {
      logger.warn(`[DEPLOY] Reflection generation failed:`, err);
    }
  }
}
