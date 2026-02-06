/**
 * World State Evaluator - Computes GOAPState from board + agent status
 *
 * Pure function module (no class). Reads current feature board state and
 * auto-mode status to produce a snapshot of the world for GOAP planning.
 */

import type { GOAPState, Feature } from '@automaker/types';
import { areDependenciesSatisfied } from '@automaker/dependency-resolver';
import { createLogger } from '@automaker/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';

const logger = createLogger('WorldStateEvaluator');

/** Threshold for considering a feature "stale" (2 hours in ms) */
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/**
 * Evaluate the current world state for a project.
 *
 * Reads all features and auto-mode status, returning a flat key-value
 * GOAPState that the GOAP loop uses for goal/action evaluation.
 */
export async function evaluateWorldState(
  projectPath: string,
  branchName: string | null,
  featureLoader: FeatureLoader,
  autoModeService: AutoModeService
): Promise<GOAPState> {
  const startTime = Date.now();

  // Load all features for this project
  let features: Feature[];
  try {
    features = await featureLoader.getAll(projectPath);
  } catch (error) {
    logger.error('Failed to load features for world state evaluation', { projectPath, error });
    features = [];
  }

  // Get auto-mode status
  const autoStatus = autoModeService.getStatusForProject(projectPath, branchName);

  // Count features by status
  const backlogFeatures = features.filter((f) => f.status === 'backlog');
  const runningFeatures = features.filter((f) => f.status === 'running');
  const reviewFeatures = features.filter((f) => f.status === 'review');
  const doneFeatures = features.filter((f) => f.status === 'done');
  const failedFeatures = features.filter((f) => f.status === 'failed');

  // Compute unblocked backlog count (features with all deps satisfied)
  const unblockedBacklog = backlogFeatures.filter((f) => areDependenciesSatisfied(f, features));

  // Compute stale features (running for > 2 hours)
  const now = Date.now();
  const staleFeatures = runningFeatures.filter((f) => {
    if (!f.startedAt) return false;
    const startedAt = new Date(f.startedAt).getTime();
    return now - startedAt > STALE_THRESHOLD_MS;
  });

  const agentsRunning = autoStatus.runningCount;
  const agentsAvailable = autoStatus.maxConcurrency - agentsRunning;

  const state: GOAPState = {
    // Feature counts
    backlog_count: backlogFeatures.length,
    in_progress_count: runningFeatures.length,
    review_count: reviewFeatures.length,
    done_count: doneFeatures.length,
    failed_count: failedFeatures.length,
    total_features: features.length,

    // Agent status
    agents_running: agentsRunning,
    agents_available: Math.max(0, agentsAvailable),
    auto_mode_running: autoStatus.isAutoLoopRunning,

    // Derived booleans
    has_backlog_work: unblockedBacklog.length > 0,
    unblocked_backlog_count: unblockedBacklog.length,
    has_failed_features: failedFeatures.length > 0,
    stale_feature_count: staleFeatures.length,
    has_stale_features: staleFeatures.length > 0,
    is_idle: agentsRunning === 0 && backlogFeatures.length === 0,
  };

  const evaluationMs = Date.now() - startTime;
  logger.debug('World state evaluated', { projectPath, evaluationMs, state });

  return state;
}
