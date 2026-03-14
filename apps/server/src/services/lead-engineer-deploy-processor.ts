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
import type { GoalVerificationResult } from '@protolabsai/types';
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

    if (fresh && fresh.status !== 'done') {
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

    // Fire-and-forget goal verification (non-blocking, advisory only)
    void this.runGoalVerification(ctx);

    return {
      nextState: 'DONE',
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

  /**
   * Fire-and-forget goal-backward verification.
   * Evaluates acceptance criteria against the merged git diff via haiku LLM call.
   * Creates follow-up features for unmet criteria and stores the result in trajectory.
   * Never blocks the DONE transition.
   */
  private async runGoalVerification(ctx: StateContext): Promise<void> {
    try {
      // Collect acceptance criteria — prefer structured plan, fall back to feature description
      const criteria: string[] = [];

      if (ctx.structuredPlan?.acceptanceCriteria?.length) {
        for (const ac of ctx.structuredPlan.acceptanceCriteria) {
          criteria.push(ac.description);
        }
      }

      if (criteria.length === 0) {
        logger.info(
          `[DEPLOY] Goal verification skipped — no acceptance criteria for feature ${ctx.feature.id}`
        );
        return;
      }

      // Get git diff of merged changes
      let gitDiff = '';
      try {
        const { stdout } = await execAsync('git diff HEAD~1 HEAD -- . ":(exclude).automaker"', {
          cwd: ctx.projectPath,
          timeout: 15_000,
        });
        // Truncate large diffs to keep LLM prompt manageable
        gitDiff = stdout.length > 8000 ? stdout.slice(0, 8000) + '\n... (truncated)' : stdout;
      } catch {
        logger.warn(`[DEPLOY] Goal verification: could not get git diff, skipping`);
        return;
      }

      if (!gitDiff.trim()) {
        logger.info(`[DEPLOY] Goal verification: empty diff, skipping`);
        return;
      }

      const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

      const prompt = `You are a strict acceptance criteria evaluator for a software feature.

Feature: ${ctx.feature.title}
Description: ${(ctx.feature.description ?? '').slice(0, 800)}

Acceptance Criteria:
${criteriaList}

Git diff of merged changes:
\`\`\`diff
${gitDiff}
\`\`\`

Evaluate each acceptance criterion against the merged code changes. For each criterion, determine if it was met based solely on what is visible in the diff.

Respond with a JSON array where each element matches this schema:
{ "criterion": "<exact criterion text>", "met": true|false, "reason": "<one sentence>" }

Return ONLY the JSON array, no other text.`;

      const result = await simpleQuery({
        prompt,
        model: 'haiku',
        cwd: ctx.projectPath,
        maxTurns: 1,
        allowedTools: [],
        traceContext: {
          featureId: ctx.feature.id,
          featureName: ctx.feature.title,
          agentRole: 'goal-verification',
        },
      });

      // Parse LLM response
      let criteriaResults: Array<{ criterion: string; met: boolean; reason: string }> = [];
      try {
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          criteriaResults = JSON.parse(jsonMatch[0]) as typeof criteriaResults;
        }
      } catch {
        logger.warn(`[DEPLOY] Goal verification: failed to parse LLM response`);
        return;
      }

      const metCount = criteriaResults.filter((r) => r.met).length;
      const unmet = criteriaResults.filter((r) => !r.met);
      const followUpFeatureIds: string[] = [];

      // Create follow-up features for unmet criteria
      for (const gap of unmet) {
        try {
          const description = `## Goal Verification Gap

Feature **${ctx.feature.title}** (${ctx.feature.id}) was merged but the following acceptance criterion was not satisfied:

**Criterion:** ${gap.criterion}

**Gap Analysis:** ${gap.reason}

## Context
- Original feature: ${ctx.feature.id}
- PR: ${ctx.prNumber ? `#${ctx.prNumber}` : 'unknown'}
`;

          const followUp = await this.serviceContext.featureLoader.create(ctx.projectPath, {
            title: `Gap: "${gap.criterion.slice(0, 60)}${gap.criterion.length > 60 ? '…' : ''}"`,
            description,
            category: 'bug',
            complexity: 'small',
            status: 'backlog',
          });

          followUpFeatureIds.push(followUp.id);
        } catch (err) {
          logger.warn(`[DEPLOY] Goal verification: failed to create follow-up feature:`, err);
        }
      }

      // Build and store the verification result
      const verificationResult: GoalVerificationResult = {
        featureId: ctx.feature.id,
        timestamp: new Date().toISOString(),
        criteria: criteriaResults.map((r) => ({
          criterion: r.criterion,
          met: r.met,
          reason: r.reason,
        })),
        metCount,
        totalCount: criteriaResults.length,
        allMet: unmet.length === 0,
        followUpFeatureIds,
      };

      // Persist to trajectory directory
      try {
        const fs = await import('node:fs/promises');
        const trajectoryDir = path.join(
          ctx.projectPath,
          '.automaker',
          'trajectory',
          ctx.feature.id
        );
        await fs.mkdir(trajectoryDir, { recursive: true });
        await fs.writeFile(
          path.join(trajectoryDir, 'goal-verification.json'),
          JSON.stringify(verificationResult, null, 2),
          'utf-8'
        );
      } catch (err) {
        logger.warn(`[DEPLOY] Goal verification: failed to write result to disk:`, err);
      }

      this.serviceContext.events.emit('feature:goal-verification:complete' as EventType, {
        featureId: ctx.feature.id,
        projectPath: ctx.projectPath,
        allMet: verificationResult.allMet,
        metCount,
        totalCount: verificationResult.totalCount,
        followUpFeatureIds,
      });

      logger.info(
        `[DEPLOY] Goal verification complete for ${ctx.feature.id}: ${metCount}/${verificationResult.totalCount} criteria met`,
        { allMet: verificationResult.allMet, followUpCount: followUpFeatureIds.length }
      );
    } catch (err) {
      logger.warn(`[DEPLOY] Goal verification failed:`, err);
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
