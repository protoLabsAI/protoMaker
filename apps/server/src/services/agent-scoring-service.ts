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
  /** Cache featureId → projectPath for pipeline scoring */
  private featureProjectMap = new Map<string, string>();

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
        // Evict from pipeline cache when features reach terminal states
        if (data.featureId && (data.newStatus === 'done' || data.newStatus === 'verified')) {
          this.featureProjectMap.delete(data.featureId);
        }
      }

      // Track pipeline feature → projectPath mapping
      if (type === 'pipeline:phase-entered') {
        const data = payload as { featureId?: string; projectPath?: string };
        if (data.featureId && data.projectPath) {
          this.featureProjectMap.set(data.featureId, data.projectPath);
        }
      }

      // Pipeline phase scoring
      if (type === 'pipeline:phase-completed') {
        const data = payload as {
          featureId?: string;
          phase?: string;
          durationMs?: number;
        };
        if (data.featureId) {
          void this.scorePipelinePhase(data.featureId, data.phase, data.durationMs);
        }
      }

      if (type === 'pipeline:gate-waiting') {
        const data = payload as { featureId?: string; phase?: string };
        if (data.featureId) {
          void this.scorePipelineGateHeld(data.featureId, data.phase);
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
        this.scoreBuildPass(langfuse, traceId, true);
        this.scoreReworkCount(langfuse, traceId, feature);
      } else if (newStatus === 'review' && oldStatus === 'in_progress') {
        this.scoreSuccess(langfuse, traceId, 0.7, 'Feature in review — PR created');
        this.scoreEfficiency(langfuse, traceId, feature);
        this.scoreBuildPass(langfuse, traceId, true);
        this.scoreReworkCount(langfuse, traceId, feature);
      } else if (newStatus === 'backlog' && oldStatus === 'in_progress') {
        this.scoreSuccess(langfuse, traceId, 0.0, 'Feature reset to backlog — agent failed');
        this.scoreBuildPass(langfuse, traceId, false);
        this.scoreReworkCount(langfuse, traceId, feature);
      } else if (newStatus === 'blocked' && oldStatus === 'in_progress') {
        this.scoreSuccess(langfuse, traceId, 0.0, 'Feature blocked — agent failed');
        this.scoreBuildPass(langfuse, traceId, false);
        this.scoreReworkCount(langfuse, traceId, feature);
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

  private scoreBuildPass(langfuse: LangfuseClient, traceId: string, passed: boolean): void {
    const value = passed ? 1.0 : 0.0;
    const comment = passed
      ? 'Build passed — agent produced compilable code'
      : 'Build failed — agent did not produce working code';
    langfuse.createScore({ traceId, name: 'agent.build_pass', value, comment });
    logger.debug(`Scored agent.build_pass=${value} for trace ${traceId}`);
  }

  private scoreReworkCount(langfuse: LangfuseClient, traceId: string, feature: Feature): void {
    const attempts = feature.executionHistory?.length ?? 1;
    // Normalize: 1 attempt = 1.0 (perfect), 2 = 0.5, 3 = 0.33, etc.
    const value = Math.min(1.0, 1 / attempts);
    const comment = `${attempts} execution attempt(s)${attempts > 1 ? ' — required rework' : ''}`;
    langfuse.createScore({ traceId, name: 'agent.rework_count', value, comment });
    logger.debug(
      `Scored agent.rework_count=${value.toFixed(2)} (${attempts} attempts) for trace ${traceId}`
    );
  }

  private async scorePipelinePhase(
    featureId: string,
    phase?: string,
    durationMs?: number
  ): Promise<void> {
    try {
      const langfuse = getLangfuseInstance();
      if (!langfuse.isAvailable()) return;

      const projectPath = this.findProjectPath(featureId);
      if (!projectPath) return;

      const feature = await this.featureLoader.get(projectPath, featureId);
      const traceId = feature?.pipelineState?.traceId;
      if (!traceId) return;

      langfuse.createScore({
        traceId,
        name: 'pipeline.phase.success',
        value: 1.0,
        comment: `Phase ${phase} completed${durationMs ? ` in ${Math.round(durationMs / 1000)}s` : ''}`,
      });

      // Score pipeline completion when PUBLISH phase completes
      if (phase === 'PUBLISH') {
        langfuse.createScore({
          traceId,
          name: 'pipeline.success',
          value: 1.0,
          comment: 'Full pipeline completed successfully',
        });
      }

      await langfuse.flush();
    } catch (error) {
      logger.error(`Failed to score pipeline phase for ${featureId}:`, error);
    }
  }

  private async scorePipelineGateHeld(featureId: string, phase?: string): Promise<void> {
    try {
      const langfuse = getLangfuseInstance();
      if (!langfuse.isAvailable()) return;

      const projectPath = this.findProjectPath(featureId);
      if (!projectPath) return;

      const feature = await this.featureLoader.get(projectPath, featureId);
      const traceId = feature?.pipelineState?.traceId;
      if (!traceId) return;

      langfuse.createScore({
        traceId,
        name: 'pipeline.gate.held',
        value: 0.5,
        comment: `Gate held at ${phase} — human review required`,
      });

      await langfuse.flush();
    } catch (error) {
      logger.error(`Failed to score pipeline gate for ${featureId}:`, error);
    }
  }

  /**
   * Find the project path for a feature from the pipeline event cache.
   */
  private findProjectPath(featureId: string): string | null {
    return this.featureProjectMap.get(featureId) ?? null;
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
