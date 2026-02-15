/**
 * AgentScoringService — Automatically scores agent traces based on feature lifecycle events.
 *
 * Listens to feature:status-changed events and creates Langfuse scores:
 * - agent.success: 1.0 (done), 0.7 (review), 0.0 (reset to backlog/blocked)
 * - agent.efficiency: turnsUsed / maxTurns (lower ratio = more efficient)
 * - agent.quality: based on CodeRabbit review thread count
 */

import { createLogger } from '@automaker/utils';
import type { Feature } from '@automaker/types';
import { getLangfuseInstance } from '../lib/langfuse-singleton.js';
import type { LangfuseClient } from '@automaker/observability';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';

const logger = createLogger('AgentScoringService');

export class AgentScoringService {
  private events: EventEmitter;
  private featureLoader: FeatureLoader;

  constructor(events: EventEmitter, featureLoader: FeatureLoader) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.registerListeners();
  }

  private registerListeners(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'feature:status-changed') {
        const data = payload as {
          featureId: string;
          oldStatus?: string;
          newStatus?: string;
          projectPath?: string;
        };
        if (data.projectPath && data.featureId) {
          void this.handleStatusChanged(
            data.projectPath,
            data.featureId,
            data.oldStatus,
            data.newStatus
          );
        }
      }
    });

    logger.info('Agent scoring service initialized');
  }

  private async handleStatusChanged(
    projectPath: string,
    featureId: string,
    oldStatus?: string,
    newStatus?: string
  ): Promise<void> {
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) return;

      const traceId = feature.lastTraceId;
      if (!traceId) return;

      const langfuse = getLangfuseInstance();
      if (!langfuse.isAvailable()) return;

      // Score based on status transition
      if (newStatus === 'done' && oldStatus !== 'done') {
        this.scoreSuccess(langfuse, traceId, 1.0, 'Feature completed — PR merged');
        this.scoreEfficiency(langfuse, traceId, feature);
        this.scoreQuality(langfuse, traceId, feature);
      } else if (newStatus === 'review' && oldStatus === 'in_progress') {
        this.scoreSuccess(langfuse, traceId, 0.7, 'Feature in review — PR created');
        this.scoreEfficiency(langfuse, traceId, feature);
      } else if (newStatus === 'backlog' && oldStatus === 'in_progress') {
        this.scoreSuccess(langfuse, traceId, 0.0, 'Feature reset to backlog — agent failed');
      } else if (newStatus === 'blocked' && oldStatus === 'in_progress') {
        this.scoreSuccess(langfuse, traceId, 0.0, 'Feature blocked — agent failed');
      }

      // Flush after scoring
      await langfuse.flush();
    } catch (error) {
      logger.error(`Failed to score feature ${featureId}:`, error);
    }
  }

  private scoreSuccess(
    langfuse: LangfuseClient,
    traceId: string,
    value: number,
    comment: string
  ): void {
    langfuse.createScore({ traceId, name: 'agent.success', value, comment });
    logger.debug(`Scored agent.success=${value} for trace ${traceId}`);
  }

  private scoreEfficiency(langfuse: LangfuseClient, traceId: string, feature: Feature): void {
    const lastExecution = feature.executionHistory?.[feature.executionHistory.length - 1];
    if (!lastExecution?.turnCount) return;

    const maxTurns = feature.maxTurns ?? this.getDefaultMaxTurns(feature.complexity);
    // Lower ratio = more efficient (used fewer turns)
    const efficiency = 1 - Math.min(lastExecution.turnCount / maxTurns, 1);
    const comment = `Used ${lastExecution.turnCount}/${maxTurns} turns`;

    langfuse.createScore({ traceId, name: 'agent.efficiency', value: efficiency, comment });
    logger.debug(`Scored agent.efficiency=${efficiency.toFixed(2)} for trace ${traceId}`);
  }

  private scoreQuality(langfuse: LangfuseClient, traceId: string, feature: Feature): void {
    const threadCount = feature.threadFeedback?.length ?? 0;
    // 0 issues = 1.0, scale down by 0.1 per issue, min 0
    const quality = Math.max(0, 1 - threadCount * 0.1);
    const comment =
      threadCount === 0 ? 'Clean PR — no review issues' : `${threadCount} review thread(s) on PR`;

    langfuse.createScore({ traceId, name: 'agent.quality', value: quality, comment });
    logger.debug(`Scored agent.quality=${quality.toFixed(2)} for trace ${traceId}`);
  }

  private getDefaultMaxTurns(complexity?: string): number {
    switch (complexity) {
      case 'small':
        return 200;
      case 'medium':
        return 500;
      case 'large':
        return 750;
      case 'architectural':
        return 1000;
      default:
        return 500;
    }
  }
}
