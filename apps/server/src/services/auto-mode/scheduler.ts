/**
 * AutoModeScheduler - Queue management, feature selection, and concurrency control
 *
 * Responsibilities:
 * - Load and filter pending features from disk
 * - Apply dependency-aware ordering
 * - Manage feature selection for execution
 * - Track starting/running features to enforce concurrency
 */

import * as path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import type { Feature } from '@automaker/types';
import { normalizeFeatureStatus } from '@automaker/types';
import { createLogger, readJsonWithRecovery, logRecoveryWarning } from '@automaker/utils';
import { getFeaturesDir, secureFs } from '@automaker/platform';
import { resolveDependencies } from '@automaker/dependency-resolver';
import type { ProjectAutoLoopState } from './types.js';

const execAsync = promisify(exec);

/**
 * Get the current branch name for a project
 */
async function getCurrentBranch(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
    const branch = stdout.trim();
    return branch || null;
  } catch {
    return null;
  }
}

const logger = createLogger('AutoMode:Scheduler');

// Default backup count for recovery
const DEFAULT_BACKUP_COUNT = 3;

/**
 * Callback for getting all worktree branches
 */
export type WorktreeBranchesGetter = (projectPath: string) => Promise<Set<string>>;

/**
 * Callback for checking if a feature is finished
 */
export type FeatureFinishedChecker = (feature: Feature) => boolean;

/**
 * Feature selection context for the auto-loop
 */
export interface FeatureSelectionContext {
  pendingFeatures: Feature[];
  runningFeatureIds: Set<string>;
  startingFeatureIds: Set<string>;
  isFeatureFinished: FeatureFinishedChecker;
}

export class AutoModeScheduler {
  constructor(
    private readonly getWorktreeBranches: WorktreeBranchesGetter
  ) {}

  /**
   * Load pending features for a project/worktree with dependency ordering
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   * @returns Array of pending features in dependency order
   */
  async loadPendingFeatures(
    projectPath: string,
    branchName: string | null = null
  ): Promise<Feature[]> {
    // Features are stored in .automaker directory
    const featuresDir = getFeaturesDir(projectPath);

    // Get the actual primary branch name for the project (e.g., "main", "master", "develop")
    // This is needed to correctly match features when branchName is null (main worktree)
    const primaryBranch = await getCurrentBranch(projectPath);

    // Get all branches that have existing worktrees
    // Used to identify orphaned features (features with branchNames but no worktrees)
    const worktreeBranches = await this.getWorktreeBranches(projectPath);

    try {
      const entries = await secureFs.readdir(featuresDir, {
        withFileTypes: true,
      });
      const allFeatures: Feature[] = [];
      const pendingFeatures: Feature[] = [];

      // Load all features (for dependency checking) with recovery support
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');

          // Use recovery-enabled read for corrupted file handling
          const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
            maxBackups: DEFAULT_BACKUP_COUNT,
            autoRestore: true,
          });

          logRecoveryWarning(result, `Feature ${entry.name}`, logger);

          const feature = result.data;
          if (!feature) {
            // Skip features that couldn't be loaded or recovered
            continue;
          }

          // Normalize status to handle legacy values
          const canonicalStatus = normalizeFeatureStatus(feature.status);

          // Push normalized copy to allFeatures so dependency resolution sees canonical statuses
          const normalizedFeature = {
            ...feature,
            status: canonicalStatus,
          };
          allFeatures.push(normalizedFeature);

          // Track pending features separately, filtered by worktree/branch
          // Note: Features in 'review', 'done', or 'verified' are NOT eligible
          // Those features have completed execution and should not be picked up again
          const isEligibleStatus =
            canonicalStatus === 'backlog' ||
            (feature.planSpec?.status === 'approved' &&
              (feature.planSpec.tasksCompleted ?? 0) < (feature.planSpec.tasksTotal ?? 0));

          // Log ALL features with their eligibility status for debugging
          logger.debug(
            `[loadPendingFeatures] Feature ${feature.id}: status="${feature.status}", assignee="${feature.assignee ?? 'null'}", isEpic=${feature.isEpic ?? false}, branchName="${feature.branchName ?? 'null'}", eligible=${isEligibleStatus}`
          );

          if (isEligibleStatus) {
            // Skip epic features - they are containers, not executable
            if (feature.isEpic) {
              logger.info(
                `[loadPendingFeatures] Skipping epic feature ${feature.id} - ${feature.title}`
              );
              continue;
            }

            // Skip features assigned to humans (non-agent assignees)
            if (feature.assignee && feature.assignee !== 'agent') {
              logger.info(
                `[loadPendingFeatures] Skipping feature ${feature.id} - assigned to "${feature.assignee}" (not agent)`
              );
              continue;
            }

            // Filter by branchName
            const featureBranch = feature.branchName ?? null;
            if (branchName === null) {
              // Main worktree: include features that are unassigned, on primary branch, or orphaned
              const isPrimaryOrUnassigned =
                featureBranch === null || (primaryBranch && featureBranch === primaryBranch);
              // Orphaned = has branchName but no corresponding worktree exists
              const isOrphaned = featureBranch !== null && !worktreeBranches.has(featureBranch);
              // Stale worktree = has branchName with existing worktree BUT feature is in backlog
              const hasStaleWorktree =
                featureBranch !== null &&
                worktreeBranches.has(featureBranch) &&
                (feature.status === 'backlog' ||
                  feature.status === 'pending' ||
                  feature.status === 'ready');

              logger.debug(
                `[loadPendingFeatures] Feature ${feature.id} branch filter - featureBranch: ${featureBranch}, primaryBranch: ${primaryBranch}, isPrimaryOrUnassigned: ${isPrimaryOrUnassigned}, isOrphaned: ${isOrphaned}, hasStaleWorktree: ${hasStaleWorktree}`
              );

              if (isPrimaryOrUnassigned || isOrphaned || hasStaleWorktree) {
                if (hasStaleWorktree) {
                  logger.info(
                    `[loadPendingFeatures] Including feature ${feature.id} with stale worktree (branchName: ${featureBranch}, status: ${feature.status}) for main worktree`
                  );
                } else if (isOrphaned) {
                  logger.info(
                    `[loadPendingFeatures] Including orphaned feature ${feature.id} (branchName: ${featureBranch} has no worktree) for main worktree`
                  );
                } else {
                  logger.info(
                    `[loadPendingFeatures] Including feature ${feature.id} for main worktree (featureBranch: ${featureBranch})`
                  );
                }
                pendingFeatures.push(feature);
              } else {
                // Feature belongs to a specific worktree AND is actively being worked on (in_progress)
                logger.info(
                  `[loadPendingFeatures] Filtering out feature ${feature.id} (branchName: ${featureBranch} has worktree, status: ${feature.status}) for main worktree`
                );
              }
            } else {
              // Feature worktree: include features with matching branchName
              if (featureBranch === branchName) {
                logger.info(
                  `[loadPendingFeatures] Including feature ${feature.id} for worktree ${branchName}`
                );
                pendingFeatures.push(feature);
              } else {
                logger.info(
                  `[loadPendingFeatures] Filtering out feature ${feature.id} (branchName: ${featureBranch}, expected: ${branchName}) for worktree ${branchName}`
                );
              }
            }
          }
        }
      }

      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(
        `[loadPendingFeatures] Found ${allFeatures.length} total features, ${pendingFeatures.length} candidates (pending/ready/backlog/approved_with_pending_tasks) for ${worktreeDesc}`
      );

      if (pendingFeatures.length === 0) {
        logger.warn(
          `[loadPendingFeatures] No pending features found for ${worktreeDesc}. Check branchName matching - looking for branchName: ${branchName === null ? 'null (main)' : branchName}`
        );
        // Log all backlog features to help debug branchName matching
        const allBacklogFeatures = allFeatures.filter(
          (f) =>
            f.status === 'backlog' ||
            f.status === 'pending' ||
            f.status === 'ready' ||
            (f.planSpec?.status === 'approved' &&
              (f.planSpec.tasksCompleted ?? 0) < (f.planSpec.tasksTotal ?? 0))
        );
        if (allBacklogFeatures.length > 0) {
          logger.info(
            `[loadPendingFeatures] Found ${allBacklogFeatures.length} backlog features with branchNames: ${allBacklogFeatures.map((f) => `${f.id}(${f.branchName ?? 'null'})`).join(', ')}`
          );
        }
      }

      // Apply dependency-aware ordering
      const { orderedFeatures, missingDependencies } = resolveDependencies(pendingFeatures);

      // Remove TRULY missing dependencies (feature ID doesn't exist anywhere on the board).
      // Dependencies that exist in allFeatures but not in pendingFeatures are NOT missing —
      // they're just in a different status (in_progress, done, review, etc.).
      if (missingDependencies.size > 0) {
        const allFeatureIds = new Set(allFeatures.map((f) => f.id));

        for (const [featureId, missingDepIds] of missingDependencies) {
          const feature = pendingFeatures.find((f) => f.id === featureId);
          if (feature && feature.dependencies) {
            // Only remove deps that are TRULY gone (not on the board at all)
            const trulyMissingDepIds = missingDepIds.filter((depId) => !allFeatureIds.has(depId));

            if (trulyMissingDepIds.length > 0) {
              const validDependencies = feature.dependencies.filter(
                (depId) => !trulyMissingDepIds.includes(depId)
              );

              logger.warn(
                `[loadPendingFeatures] Feature ${featureId} has truly missing dependencies (deleted from board): ${trulyMissingDepIds.join(', ')}. Removing them.`
              );

              // Update the feature in memory
              feature.dependencies = validDependencies.length > 0 ? validDependencies : undefined;
            }
          }
        }
      }

      return orderedFeatures;
    } catch (error) {
      logger.error(`Failed to load pending features for ${projectPath}:`, error);
      return [];
    }
  }

  /**
   * Select the next feature to execute from pending features
   * @param context - The feature selection context
   * @returns The next feature to execute, or null if none available
   */
  selectNextFeature(context: FeatureSelectionContext): Feature | null {
    const { pendingFeatures, runningFeatureIds, startingFeatureIds, isFeatureFinished } = context;

    // Find a feature not currently running, not being started, and not yet finished
    const nextFeature = pendingFeatures.find(
      (f) =>
        !runningFeatureIds.has(f.id) &&
        !startingFeatureIds.has(f.id) &&
        !isFeatureFinished(f)
    );

    // Log selection details for debugging
    logger.info(
      `[selectNextFeature] Feature selection from ${pendingFeatures.length} pending: ${pendingFeatures.map((f) => `${f.id}(running:${runningFeatureIds.has(f.id)},finished:${isFeatureFinished(f)})`).join(', ')}`
    );

    return nextFeature ?? null;
  }

  /**
   * Check if there's capacity to start a new feature
   * @param projectState - The project auto-loop state
   * @param currentRunningCount - Current running feature count
   * @returns Whether there's capacity for a new feature
   */
  hasCapacity(projectState: ProjectAutoLoopState, currentRunningCount: number): boolean {
    const startingCount = projectState.startingFeatures.size;
    const totalOccupied = currentRunningCount + startingCount;
    return totalOccupied < projectState.config.maxConcurrency;
  }

  /**
   * Get current capacity info for logging/debugging
   * @param projectState - The project auto-loop state
   * @param currentRunningCount - Current running feature count
   */
  getCapacityInfo(projectState: ProjectAutoLoopState, currentRunningCount: number): {
    running: number;
    starting: number;
    total: number;
    max: number;
    available: number;
  } {
    const startingCount = projectState.startingFeatures.size;
    const total = currentRunningCount + startingCount;
    return {
      running: currentRunningCount,
      starting: startingCount,
      total,
      max: projectState.config.maxConcurrency,
      available: Math.max(0, projectState.config.maxConcurrency - total),
    };
  }
}
