/**
 * Lead Engineer — Deploy State Processor
 *
 * Verifies feature is marked done after merge, generates a reflection,
 * and saves trajectory data.
 */

import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import { getFeatureDir } from '@protolabsai/platform';
import type { EventType } from '@protolabsai/types';
import { simpleQuery } from '../providers/simple-query-service.js';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';

const execAsync = promisify(exec);

/** Timeout for each post-merge verification command (ms) */
const POST_MERGE_VERIFICATION_TIMEOUT_MS = 120_000;

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

    // Run post-merge verification (typecheck, optional build:packages)
    await this.runPostMergeVerification(ctx);

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

  /**
   * Run post-merge verification commands to catch type or build regressions.
   * On command failure: creates a bug-fix feature on the board.
   * On timeout: logs a warning and continues (does not block the pipeline).
   */
  private async runPostMergeVerification(ctx: StateContext): Promise<void> {
    const workflowSettings = await getWorkflowSettings(
      ctx.projectPath,
      this.serviceContext.settingsService
    );

    const verificationEnabled = workflowSettings.postMergeVerification ?? true;
    if (!verificationEnabled) {
      logger.info('[DEPLOY] Post-merge verification disabled, skipping');
      return;
    }

    const baseCommands: string[] = workflowSettings.postMergeVerificationCommands ?? [
      'npm run typecheck',
    ];

    // Check if the merged commit touched any libs/ files — if so, also build packages
    let touchedLibs = false;
    try {
      const { stdout: diffFiles } = await execAsync('git diff --name-only HEAD~1 HEAD', {
        cwd: ctx.projectPath,
        timeout: 10_000,
      });
      touchedLibs = diffFiles.split('\n').some((f) => f.trim().startsWith('libs/'));
    } catch {
      // If git diff fails, skip the libs/ detection
    }

    const commands = [...baseCommands];
    const buildPackagesCmd = 'npm run build:packages';
    if (touchedLibs && !commands.includes(buildPackagesCmd)) {
      commands.push(buildPackagesCmd);
    }

    logger.info(`[DEPLOY] Running post-merge verification commands: ${commands.join(', ')}`);

    const failures: { cmd: string; output: string }[] = [];

    for (const cmd of commands) {
      try {
        await execAsync(cmd, {
          cwd: ctx.projectPath,
          timeout: POST_MERGE_VERIFICATION_TIMEOUT_MS,
        });
        logger.info(`[DEPLOY] Verification passed: ${cmd}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // child_process timeout kills the process and sets `killed: true` on the error object,
        // or includes "timeout" in the message
        const isTimeout =
          errMsg.toLowerCase().includes('timeout') ||
          (err !== null &&
            typeof err === 'object' &&
            'killed' in err &&
            (err as { killed: boolean }).killed === true);

        if (isTimeout) {
          logger.warn(
            `[DEPLOY] Verification command timed out after ${POST_MERGE_VERIFICATION_TIMEOUT_MS / 1000}s, skipping: ${cmd}`
          );
          continue;
        }

        const output = errMsg.slice(0, 2000);
        logger.warn(`[DEPLOY] Verification command failed: ${cmd}`, { output });
        failures.push({ cmd, output });
      }
    }

    if (failures.length > 0) {
      await this.createVerificationBugFeature(ctx, failures);
    }
  }

  /**
   * Create a bug-fix feature on the board when post-merge verification fails.
   */
  private async createVerificationBugFeature(
    ctx: StateContext,
    failures: { cmd: string; output: string }[]
  ): Promise<void> {
    try {
      const failureSummary = failures
        .map((f) => `**\`${f.cmd}\`**\n\`\`\`\n${f.output}\n\`\`\``)
        .join('\n\n');

      const description = `## Post-Merge Verification Failure

Feature **${ctx.feature.title}** (${ctx.feature.id}) was merged but post-merge verification failed. The code is live — this bug fix should address the regression.

## Failed Commands

${failureSummary}

## Context
- Original feature: ${ctx.feature.id}
- PR: ${ctx.prNumber ? `#${ctx.prNumber}` : 'unknown'}
- Branch: ${ctx.feature.branchName ?? 'unknown'}
`;

      await this.serviceContext.featureLoader.create(ctx.projectPath, {
        title: `Fix: post-merge verification failure for "${ctx.feature.title}"`,
        description,
        category: 'bug',
        complexity: 'medium',
        status: 'backlog',
      });

      logger.info(`[DEPLOY] Created bug-fix feature for verification failure of ${ctx.feature.id}`);
    } catch (err) {
      logger.warn(`[DEPLOY] Failed to create bug-fix feature:`, err);
    }
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
