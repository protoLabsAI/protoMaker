/**
 * FeatureLifecycleBusPublisher — forwards terminal board-feature transitions to
 * the protoWorkstacean bus so downstream consumers can close the loop without
 * polling protoMaker.
 *
 * Subscribes to the existing `feature:status-changed` event (emitted by
 * FeatureLoader.update) and, when a feature transitions into a terminal state,
 * publishes `feature.completed` (status -> done) or `feature.failed`
 * (status -> blocked / escalated) to protoWorkstacean's /publish endpoint —
 * the dotted, unprefixed topics workstacean's consumers subscribe to. The
 * payload echoes the originating
 * signal metadata so a consumer (e.g. the Linear ↔ protoMaker bridge) can
 * reconstruct lineage and post a "feature done" comment on the source issue.
 * See protoLabsAI/protoMaker#3549 and the downstream consumer
 * protoLabsAI/protoWorkstacean#482.
 *
 * Opt-in: only active when WORKSTACEAN_URL is explicitly set, so installs
 * without protoWorkstacean don't attempt (and log) a publish on every feature
 * completion. The canonical board has a single terminal state (`done`); the
 * TERMINAL_STATUSES and FAILURE_STATUSES sets are the extension point if more
 * are added later.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import { publish as workstaceanPublish } from '../client/workstacean-api.client.js';

const logger = createLogger('FeatureLifecycleBusPublisher');

/** Board statuses treated as terminal (success) for lifecycle-event purposes. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done']);

/** Board statuses treated as terminal (failure) — emit `feature.failed`. */
const FAILURE_STATUSES: ReadonlySet<string> = new Set(['blocked', 'escalated']);

/** Subset of the `feature:status-changed` payload this publisher needs. */
interface StatusChangedPayload {
  featureId: string;
  oldStatus?: string;
  newStatus?: string;
  projectPath?: string;
  reason?: string;
}

type PublishFn = (payload: {
  event: string;
  data: Record<string, unknown>;
}) => Promise<{ ok: boolean; error?: string }>;

export class FeatureLifecycleBusPublisher {
  private readonly enabled: boolean;

  constructor(
    private readonly events: Pick<EventEmitter, 'on'>,
    private readonly featureLoader: Pick<FeatureLoader, 'get'>,
    private readonly publishFn: PublishFn = workstaceanPublish,
    enabled: boolean = Boolean(process.env.WORKSTACEAN_URL)
  ) {
    this.enabled = enabled;
  }

  /** Wire up the subscription. No-op (with a debug log) when disabled. */
  start(): void {
    if (!this.enabled) {
      logger.debug('Feature lifecycle bus publishing disabled — WORKSTACEAN_URL not set');
      return;
    }
    this.events.on('feature:status-changed', (payload) => {
      void this.handleStatusChange(payload);
    });
    logger.info('Feature lifecycle bus publishing enabled');
  }

  /**
   * Publish `feature.completed` when a feature reaches a terminal
   * success state (done), or `feature.failed` when it reaches a
   * terminal failure state (blocked / escalated). Loads the feature fresh to
   * echo its source signal metadata and PR tracking fields. Never throws — a
   * publish failure must not affect the board transition.
   */
  async handleStatusChange(payload: StatusChangedPayload): Promise<void> {
    const { featureId, newStatus, oldStatus, projectPath } = payload ?? {};
    if (!featureId || !projectPath || !newStatus) {
      return;
    }

    const isTerminal = TERMINAL_STATUSES.has(newStatus);
    const isFailure = FAILURE_STATUSES.has(newStatus);
    if (!isTerminal && !isFailure) {
      return;
    }

    let feature = null;
    try {
      feature = await this.featureLoader.get(projectPath, featureId);
    } catch (err) {
      logger.warn(`Could not load feature ${featureId} for lifecycle event:`, err);
    }

    // Dotted, unprefixed topics — exactly what workstacean's consumers
    // subscribe to (`feature.completed` / `feature.failed`). The earlier
    // `protomaker.`-prefixed names never matched, so #482 stayed silent.
    const topic = isTerminal ? 'feature.completed' : 'feature.failed';
    const owner = process.env.GITHUB_REPO_OWNER;
    const name = process.env.GITHUB_REPO_NAME;
    const repo = owner && name ? `${owner}/${name}` : undefined;
    // Lineage so consumers correlate to their source record without persisted
    // state. Prefer the echoed manage_feature meta; fall back to intake signal.
    const sourceMeta =
      feature?.sourceMeta && typeof feature.sourceMeta === 'object'
        ? feature.sourceMeta
        : { sourceChannel: feature?.sourceChannel, signalMetadata: feature?.signalMetadata };
    const data: Record<string, unknown> = {
      // projectSlug is REQUIRED by workstacean's feature-notifier (resolves the
      // dev channel); fall back so the event is never dropped for lacking it.
      projectSlug: feature?.projectSlug ?? process.env.WORKSTACEAN_PROJECT_SLUG ?? 'protomaker',
      featureId,
      featureTitle: feature?.title,
      prNumber: feature?.prNumber,
      branchName: feature?.branchName,
      repo,
      previousStatus: oldStatus,
      sourceMeta,
      [isTerminal ? 'completedAt' : 'failedAt']: new Date().toISOString(),
    };
    if (!isTerminal) {
      data.error = (feature?.statusChangeReason ?? payload?.reason ?? 'failed').slice(0, 400);
    }
    try {
      const result = await this.publishFn({ event: topic, data });
      if (!result.ok) {
        logger.warn(`Failed to publish ${topic} for ${featureId}: ${result.error}`);
      }
    } catch (err) {
      logger.warn(`Error publishing ${topic} for ${featureId}:`, err);
    }
  }
}
