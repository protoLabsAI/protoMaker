/**
 * PostMergeReconcilerCheck — Poll-based fallback for missed PR merge webhooks.
 *
 * The primary PR merge flow relies on GitHub webhook events at /github.
 * However, webhooks are only delivered for repos where the hook is registered.
 * When a feature's PR merges on a repo that has no hook configured (e.g., a
 * secondary tracked repo like mythxengine), no event fires and the feature
 * stays stuck in 'review' indefinitely — causing auto-mode to retry the
 * already-merged branch until it hits max retries.
 *
 * This check runs on the 'critical' maintenance tier (every 5 minutes) and
 * queries GitHub directly for every feature currently in 'review' status
 * that has a prNumber and prUrl. If the PR is merged, it transitions the
 * feature to 'done' and emits the standard feature:pr-merged event so
 * downstream listeners (TopicBus, UI) react identically to the webhook path.
 *
 * Idempotency: features already in a terminal status are skipped silently.
 *
 * See: protoLabsAI/protoMaker#3115
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from '../../feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';

const logger = createLogger('PostMergeReconcilerCheck');

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { encoding: string; timeout: number }
) => Promise<{ stdout: string; stderr: string }>;

/** GitHub CLI `gh pr view --json state,merged` response */
interface PRViewResult {
  state: 'OPEN' | 'CLOSED' | 'MERGED' | string;
  merged: boolean;
}

/** Statuses that indicate the feature is already done — skip reconciliation. */
const TERMINAL_STATUSES = new Set(['done', 'completed', 'verified']);

/**
 * Extract `owner/repo` from a GitHub PR URL.
 *
 * @example
 * extractRepoFromPrUrl('https://github.com/protoLabsAI/mythxengine/pull/184')
 * // → 'protoLabsAI/mythxengine'
 */
export function extractRepoFromPrUrl(prUrl: string): string | null {
  const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\//);
  return match ? match[1] : null;
}

export class PostMergeReconcilerCheck {
  private readonly execFileAsync: ExecFileAsync;

  constructor(
    private readonly featureLoader: FeatureLoader,
    private readonly events: EventEmitter,
    execFileAsyncOverride?: ExecFileAsync
  ) {
    this.execFileAsync = execFileAsyncOverride ?? (promisify(execFile) as ExecFileAsync);
  }

  /**
   * Reconcile PR merge status for all 'review' features in the given project.
   *
   * @returns Counts of features checked and transitioned to done.
   */
  async run(projectPath: string): Promise<{ checked: number; reconciled: number }> {
    let checked = 0;
    let reconciled = 0;

    try {
      const features = await this.featureLoader.getAll(projectPath);

      const reviewFeatures = features.filter(
        (f) => f.status === 'review' && f.prNumber != null && f.prUrl
      );

      for (const feature of reviewFeatures) {
        // Idempotency guard — skip if already in a terminal status
        if (TERMINAL_STATUSES.has(feature.status ?? '')) continue;

        const repo = extractRepoFromPrUrl(feature.prUrl!);
        if (!repo) {
          logger.debug(
            `[reconciler] Could not extract repo from prUrl "${feature.prUrl}" for feature ${feature.id} — skipping`
          );
          continue;
        }

        checked++;

        try {
          const { stdout } = await this.execFileAsync(
            'gh',
            ['pr', 'view', String(feature.prNumber), '--repo', repo, '--json', 'state,merged'],
            { encoding: 'utf-8', timeout: 10_000 }
          );

          const prData = JSON.parse(stdout) as PRViewResult;
          const isMerged = prData.state === 'MERGED' || prData.merged === true;

          if (!isMerged) {
            logger.debug(
              `[reconciler] PR #${feature.prNumber} on ${repo} is not merged (state=${prData.state}) — skipping`
            );
            continue;
          }

          // PR is merged but we never received the webhook — reconcile now
          logger.info(
            `[reconciler] PR #${feature.prNumber} on ${repo} is merged — transitioning feature "${feature.title}" (${feature.id}) from review → done (missed webhook)`
          );

          await this.featureLoader.update(projectPath, feature.id, {
            status: 'done',
            statusChangeReason: 'merged PR detected via poll reconciliation',
          });

          this.events.emit('feature:pr-merged', {
            featureId: feature.id,
            title: feature.title ?? feature.id,
            prNumber: feature.prNumber,
            prTitle: '',
            branchName: feature.branchName ?? '',
            projectPath,
          });

          reconciled++;
        } catch (prCheckErr) {
          // Non-fatal: log and continue to next feature
          logger.debug(
            `[reconciler] Could not check PR #${feature.prNumber} for feature ${feature.id} on ${repo}: ${prCheckErr instanceof Error ? prCheckErr.message : String(prCheckErr)}`
          );
        }
      }
    } catch (err) {
      logger.error(`[reconciler] Failed to reconcile project ${projectPath}:`, err);
    }

    return { checked, reconciled };
  }
}
