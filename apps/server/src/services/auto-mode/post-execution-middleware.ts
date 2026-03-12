/**
 * PostExecutionMiddleware - Guaranteed cleanup and safety net for every agent exit path.
 *
 * Extracted from the finally block of ExecutionService.executeFeature().
 * Runs on ALL exit paths: success, error, timeout, abort — ensuring:
 *   1. Uncommitted work is detected and recovered (safety net for stranded agent work)
 *   2. Agent abort controller is fired
 *   3. Worktree lock file is removed
 *   4. Feature is removed from the runningFeatures map
 *   5. Execution state is persisted
 *
 * Every step emits structured log lines with the pattern:
 *   [PostExecution] <featureId>: <step description>
 */

import path from 'path';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import {
  checkAndRecoverUncommittedWork,
  recoverNestedWorktreeWork,
} from '../worktree-recovery-service.js';
import { removeLock } from '../../lib/worktree-lock.js';
import { activeAgentsCount } from '../../lib/prometheus.js';
import type { RunningFeature } from './execution-types.js';

const logger = createLogger('PostExecution');

// ---------------------------------------------------------------------------
// Context interface
// ---------------------------------------------------------------------------

export interface PostExecutionContext {
  /** Feature ID being cleaned up. */
  featureId: string;
  /** Main project root path. */
  projectPath: string;
  /** Feature data — may be null if the feature failed to load. */
  feature: Feature | null;
  /** The RunningFeature entry created at the start of executeFeature(). */
  tempRunningFeature: RunningFeature;
  /** Shared running features map owned by ExecutionService / AutoModeService. */
  runningFeatures: Map<string, RunningFeature>;
  /** AbortController created for this execution. */
  abortController: AbortController;
  /** Returns whether the auto loop is currently running. */
  getAutoLoopRunning: () => boolean;
  /** Persists auto-mode execution state to disk. */
  saveExecutionState: (projectPath: string) => Promise<void>;
  /**
   * Optional: resolves the git base branch to use when the safety-net creates a
   * recovery PR. Sourced from project settings. Falls back to the service default
   * when omitted or when the call throws.
   */
  getRecoveryBaseBranch?: () => Promise<string | undefined>;
  /**
   * Optional: updates the feature status after successful recovery.
   * Called with status='review' after a recovery PR is created.
   */
  updateFeatureStatus?: (projectPath: string, featureId: string, status: string) => Promise<void>;
  /**
   * Optional: emits a structured event after recovery completes.
   * Called with recovery details when uncommitted work is recovered into a PR.
   */
  emitEvent?: (eventType: string, data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// PostExecutionMiddleware
// ---------------------------------------------------------------------------

export class PostExecutionMiddleware {
  /**
   * Run the full post-execution cleanup sequence.
   *
   * This method is designed to be called from a `finally` block and therefore
   * must never throw — all errors are caught and logged internally.
   */
  async run(ctx: PostExecutionContext): Promise<void> {
    const {
      featureId,
      projectPath,
      feature,
      tempRunningFeature,
      runningFeatures,
      abortController,
    } = ctx;
    const worktreePath = tempRunningFeature.worktreePath;

    // -------------------------------------------------------------------------
    // Step 1: Uncommitted work safety net
    // Runs on every exit path (success, error, timeout, abort).
    // On the success path the worktree is typically already clean because the
    // agent committed its own work — in that case checkAndRecoverUncommittedWork
    // returns {detected: false} immediately and is a cheap no-op.
    // On the error/abort paths this catches any work the agent left behind.
    // -------------------------------------------------------------------------
    if (feature && worktreePath) {
      logger.info(`[PostExecution] ${featureId}: running uncommitted work safety net`);
      try {
        // Resolve the PR base branch from settings, falling back to the service default.
        let recoveryBaseBranch: string | undefined;
        if (ctx.getRecoveryBaseBranch) {
          try {
            recoveryBaseBranch = await ctx.getRecoveryBaseBranch();
            logger.info(
              `[PostExecution] ${featureId}: resolved recovery base branch → "${recoveryBaseBranch ?? 'default'}"`
            );
          } catch {
            logger.warn(
              `[PostExecution] ${featureId}: failed to resolve recovery base branch — using service default`
            );
          }
        }

        const workDir = path.resolve(worktreePath);
        logger.info(`[PostExecution] ${featureId}: checking for uncommitted work in ${workDir}`);

        const result = await checkAndRecoverUncommittedWork(
          feature,
          workDir,
          projectPath,
          recoveryBaseBranch
        );

        if (result.detected) {
          if (result.recovered) {
            logger.info(
              `[PostExecution] ${featureId}: recovery succeeded — PR created at ${result.prUrl}`
            );

            // Move feature to 'review' status now that a recovery PR exists.
            if (ctx.updateFeatureStatus) {
              try {
                await ctx.updateFeatureStatus(projectPath, featureId, 'review');
                logger.info(`[PostExecution] ${featureId}: feature status updated to 'review'`);
              } catch (statusError) {
                logger.error(
                  `[PostExecution] ${featureId}: failed to update feature status to 'review':`,
                  statusError
                );
              }
            }

            // Emit a recovery event so listeners can react (e.g. UI, Discord).
            if (ctx.emitEvent) {
              ctx.emitEvent('auto_mode_recovery_pr_created', {
                featureId,
                projectPath,
                prUrl: result.prUrl,
                prNumber: result.prNumber,
                prCreatedAt: result.prCreatedAt,
              });
            }
          } else {
            logger.warn(
              `[PostExecution] ${featureId}: uncommitted work detected but recovery failed: ${result.error}`
            );

            // Emit a recovery-failed event so listeners are aware.
            if (ctx.emitEvent) {
              ctx.emitEvent('auto_mode_recovery_failed', {
                featureId,
                projectPath,
                error: result.error,
              });
            }
          }
        } else {
          logger.info(`[PostExecution] ${featureId}: worktree is clean — no recovery needed`);
        }
      } catch (recoveryError) {
        // Safety net must never propagate — swallow and log.
        logger.error(
          `[PostExecution] ${featureId}: uncommitted work check threw unexpectedly:`,
          recoveryError
        );
      }

      // -----------------------------------------------------------------------
      // Step 1.5: Nested worktree scanning
      // The Claude Agent SDK creates worktrees at .claude/worktrees/agent-{id}/
      // inside the main worktree. If an agent left uncommitted work there, the
      // Step 1 check above found nothing (it only looks at the main worktree).
      // Here we copy those files into the main worktree and re-run recovery.
      // -----------------------------------------------------------------------
      logger.info(`[PostExecution] ${featureId}: scanning for nested Claude agent worktrees`);
      try {
        const mainWorkDir = path.resolve(worktreePath);
        const nestedResult = await recoverNestedWorktreeWork(mainWorkDir);

        if (!nestedResult.found) {
          logger.info(`[PostExecution] ${featureId}: no nested agent worktrees found`);
        } else if (nestedResult.worktreesWithChanges.length === 0) {
          logger.info(
            `[PostExecution] ${featureId}: nested agent worktrees found but all are clean`
          );
        } else {
          logger.info(
            `[PostExecution] ${featureId}: ${nestedResult.worktreesWithChanges.length} nested worktree(s) had uncommitted work — ` +
              `${nestedResult.copiedFiles.length} file(s) copied to main worktree`
          );

          if (nestedResult.errors.length > 0) {
            logger.warn(
              `[PostExecution] ${featureId}: nested worktree copy errors: ${nestedResult.errors.join(', ')}`
            );
          }

          if (nestedResult.copiedFiles.length > 0) {
            // Resolve recovery base branch (same logic as Step 1).
            let nestedRecoveryBaseBranch: string | undefined;
            if (ctx.getRecoveryBaseBranch) {
              try {
                nestedRecoveryBaseBranch = await ctx.getRecoveryBaseBranch();
              } catch {
                // Fall through to default
              }
            }

            logger.info(
              `[PostExecution] ${featureId}: running recovery on main worktree for nested work`
            );
            const nestedRecovery = await checkAndRecoverUncommittedWork(
              feature,
              mainWorkDir,
              projectPath,
              nestedRecoveryBaseBranch
            );

            if (nestedRecovery.detected && nestedRecovery.recovered) {
              logger.info(
                `[PostExecution] ${featureId}: nested worktree recovery succeeded — PR at ${nestedRecovery.prUrl}`
              );

              if (ctx.updateFeatureStatus) {
                try {
                  await ctx.updateFeatureStatus(projectPath, featureId, 'review');
                  logger.info(
                    `[PostExecution] ${featureId}: feature status updated to 'review' (nested recovery)`
                  );
                } catch (statusError) {
                  logger.error(
                    `[PostExecution] ${featureId}: failed to update feature status after nested recovery:`,
                    statusError
                  );
                }
              }

              if (ctx.emitEvent) {
                ctx.emitEvent('auto_mode_recovery_pr_created', {
                  featureId,
                  projectPath,
                  prUrl: nestedRecovery.prUrl,
                  prNumber: nestedRecovery.prNumber,
                  prCreatedAt: nestedRecovery.prCreatedAt,
                  source: 'nested_worktree',
                });
              }
            } else if (nestedRecovery.detected && !nestedRecovery.recovered) {
              logger.warn(
                `[PostExecution] ${featureId}: nested worktree recovery failed: ${nestedRecovery.error}`
              );
              if (ctx.emitEvent) {
                ctx.emitEvent('auto_mode_recovery_failed', {
                  featureId,
                  projectPath,
                  error: nestedRecovery.error,
                  source: 'nested_worktree',
                });
              }
            } else {
              logger.warn(
                `[PostExecution] ${featureId}: files were copied but git status shows nothing to recover`
              );
            }
          }
        }
      } catch (nestedError) {
        // Safety net must never propagate — swallow and log.
        logger.error(
          `[PostExecution] ${featureId}: nested worktree scan threw unexpectedly:`,
          nestedError
        );
      }
    } else {
      logger.info(
        `[PostExecution] ${featureId}: skipping uncommitted work check ` +
          `(worktree=${worktreePath ?? 'none'}, featureLoaded=${feature !== null})`
      );
    }

    // -------------------------------------------------------------------------
    // Step 2: Abort the agent's abort controller
    // -------------------------------------------------------------------------
    logger.info(`[PostExecution] ${featureId}: aborting agent controller`);
    try {
      abortController.abort();
    } catch (abortError) {
      logger.error(`[PostExecution] ${featureId}: abort controller threw:`, abortError);
    }

    // -------------------------------------------------------------------------
    // Step 3: Remove the worktree lock file
    // -------------------------------------------------------------------------
    if (worktreePath) {
      logger.info(`[PostExecution] ${featureId}: removing worktree lock at ${worktreePath}`);
      try {
        await removeLock(worktreePath);
      } catch (lockError) {
        logger.error(`[PostExecution] ${featureId}: failed to remove worktree lock:`, lockError);
      }
    }

    // -------------------------------------------------------------------------
    // Step 4: Remove from the running features map
    // Only removes if the current entry is still the one we created — delegated
    // executions may have replaced the entry with a new one.
    // -------------------------------------------------------------------------
    const current = runningFeatures.get(featureId);
    if (current === tempRunningFeature) {
      logger.info(`[PostExecution] ${featureId}: removing from runningFeatures`);
      runningFeatures.delete(featureId);
      activeAgentsCount.set(runningFeatures.size);
    } else {
      logger.info(`[PostExecution] ${featureId}: runningFeatures entry replaced — skipping delete`);
    }

    // -------------------------------------------------------------------------
    // Step 5: Persist execution state
    // -------------------------------------------------------------------------
    if (ctx.getAutoLoopRunning() && projectPath) {
      logger.info(`[PostExecution] ${featureId}: saving execution state`);
      try {
        await ctx.saveExecutionState(projectPath);
      } catch (stateError) {
        logger.error(`[PostExecution] ${featureId}: failed to save execution state:`, stateError);
      }
    }

    logger.info(`[PostExecution] ${featureId}: post-execution cleanup complete`);
  }
}
