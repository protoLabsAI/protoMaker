/**
 * FeatureLifecycleBusPublisher — forwards terminal board-feature transitions to
 * the protoWorkstacean bus so downstream consumers can close the loop without
 * polling protoMaker.
 *
 * Subscribes to the existing `feature:status-changed` event (emitted by
 * FeatureLoader.update) and, when a feature transitions into a terminal state,
 * publishes `protomaker.feature.completed` to protoWorkstacean's /publish
 * endpoint. The payload echoes the originating signal metadata so a consumer
 * (e.g. the Linear ↔ protoMaker bridge) can reconstruct lineage and post a
 * "feature done" comment on the source issue. See protoLabsAI/protoMaker#3549
 * and the downstream consumer protoLabsAI/protoWorkstacean#482.
 *
 * Opt-in: only active when WORKSTACEAN_URL is explicitly set, so installs
 * without protoWorkstacean don't attempt (and log) a publish on every feature
 * completion. The canonical board has a single terminal state (`done`); the
 * TERMINAL_STATUSES set is the extension point if more are added later.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import { publish as workstaceanPublish } from '../client/workstacean-api.client.js';

const logger = createLogger('FeatureLifecycleBusPublisher');

/** Board statuses treated as terminal for lifecycle-event purposes. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done']);

/** Subset of the `feature:status-changed` payload this publisher needs. */
interface StatusChangedPayload {
  featureId: string;
  oldStatus?: string;
  newStatus?: string;
  projectPath?: string;
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
   * Publish `protomaker.feature.completed` when a feature reaches a terminal
   * state. Loads the feature fresh to echo its source signal metadata. Never
   * throws — a publish failure must not affect the board transition.
   */
  async handleStatusChange(payload: StatusChangedPayload): Promise<void> {
    const { featureId, newStatus, oldStatus, projectPath } = payload ?? {};
    if (!featureId || !projectPath || !newStatus || !TERMINAL_STATUSES.has(newStatus)) {
      return;
    }

    let feature = null;
    try {
      feature = await this.featureLoader.get(projectPath, featureId);
    } catch (err) {
      logger.warn(`Could not load feature ${featureId} for lifecycle event:`, err);
    }

    const event = 'protomaker.feature.completed';
    try {
      const result = await this.publishFn({
        event,
        data: {
          featureId,
          projectPath,
          projectSlug: feature?.projectSlug,
          title: feature?.title,
          completedAt: Date.now(),
          previousStatus: oldStatus,
          // Echo the originating signal so consumers reconstruct lineage (e.g.
          // sourceLinearIssueId lives in signalMetadata) without a second query.
          sourceMeta: {
            sourceChannel: feature?.sourceChannel,
            signalMetadata: feature?.signalMetadata,
          },
        },
      });
      if (!result.ok) {
        logger.warn(`Failed to publish ${event} for ${featureId}: ${result.error}`);
      }
    } catch (err) {
      logger.warn(`Error publishing ${event} for ${featureId}:`, err);
    }
  }
}
