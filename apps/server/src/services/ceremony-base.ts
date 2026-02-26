/**
 * CeremonyBase — shared state, dependencies, and utility methods
 *
 * Extended by StandupCeremony, RetroCeremony, and ProjectRetroCeremony.
 * Provides no-op stubs for all event handler methods so that subclasses
 * only need to override the handlers they own.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import type { MetricsService } from './metrics-service.js';
import type { Feature, CeremonySettings, CeremonyAuditType } from '@protolabs-ai/types';
import { BeadsService } from './beads-service.js';
import { LinearProjectUpdateService } from './linear-project-update-service.js';
import type { CeremonyAuditLogService } from './ceremony-audit-service.js';
import crypto from 'crypto';

export const logger = createLogger('CeremonyService');

// ---------------------------------------------------------------------------
// Shared event payload interfaces (used across all ceremony classes)
// ---------------------------------------------------------------------------

export interface EpicCreatedEventPayload {
  projectPath: string;
  projectSlug: string;
  milestoneSlug: string;
  epicId: string;
}

export interface MilestoneEventPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  milestoneTitle: string;
  milestoneNumber: number;
}

export interface EpicCompletedPayload {
  projectPath: string;
  featureId: string;
  featureTitle: string;
  isEpic: true;
}

export interface ProjectCompletedPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  totalMilestones: number;
  totalFeatures: number;
  totalCostUsd: number;
  failureCount: number;
  milestoneSummaries: Array<{
    milestoneTitle: string;
    featureCount: number;
    costUsd: number;
  }>;
}

export interface ImprovementItem {
  title: string;
  description: string;
  type: 'operational' | 'code';
  priority: number;
  category?: string;
}

// ---------------------------------------------------------------------------
// CeremonyBase
// ---------------------------------------------------------------------------

export class CeremonyBase {
  protected emitter: EventEmitter | null = null;
  protected settingsService: SettingsService | null = null;
  protected featureLoader: FeatureLoader | null = null;
  protected projectService: ProjectService | null = null;
  protected metricsService: MetricsService | null = null;
  protected beadsService: BeadsService | null = null;
  protected linearProjectUpdateService: LinearProjectUpdateService | null = null;
  protected auditLog: CeremonyAuditLogService | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Observability counters for engine status */
  protected ceremonyCounts = {
    epicKickoff: 0,
    standup: 0,
    milestoneRetro: 0,
    epicDelivery: 0,
    contentBrief: 0,
    projectRetro: 0,
    postProjectDocs: 0,
    discordPostFailures: 0,
  };
  protected lastCeremonyAt: string | null = null;

  /** Dedup guard: prevent duplicate project retros from manual ceremony triggers */
  protected processedProjects = new Set<string>();

  /** Reflection observability state (absorbed from ReflectionService) */
  protected lastReflection: {
    projectTitle: string;
    projectSlug: string;
    completedAt: string;
  } | null = null;
  protected reflectionCount = 0;
  protected activeReflection: string | null = null;

  /**
   * Initialize the service with dependencies
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    projectService: ProjectService,
    metricsService: MetricsService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.projectService = projectService;
    this.metricsService = metricsService;
    this.beadsService = new BeadsService('bd', emitter);

    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'project:features:progress') {
        const progressPayload = payload as Record<string, unknown>;
        if (progressPayload.step === 'epic-created') {
          this.handleEpicCreated(progressPayload as unknown as EpicCreatedEventPayload);
        }
      } else if (type === 'milestone:started') {
        this.handleMilestoneStarted(payload as MilestoneEventPayload);
      } else if (type === 'milestone:completed') {
        this.handleMilestoneCompleted(payload as MilestoneEventPayload);
      } else if (type === 'feature:completed') {
        const data = payload as EpicCompletedPayload;
        if (data.isEpic) {
          this.handleEpicCompleted(data);
        }
      } else if (type === 'project:completed') {
        this.handleProjectCompleted(payload as ProjectCompletedPayload);
        this.handlePostProjectDocs(payload as ProjectCompletedPayload);
      } else if (type === 'authority:pm-review-approved') {
        this.handleReviewCompleted(
          payload as { projectPath: string; featureId: string; reviewNotes?: string },
          'approved'
        );
      } else if (type === 'authority:pm-review-changes-requested') {
        this.handleReviewCompleted(
          payload as { projectPath: string; featureId: string; reviewNotes?: string },
          'changes_requested'
        );
      }
    });

    logger.info('Ceremony service initialized');
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.settingsService = null;
    this.featureLoader = null;
    this.projectService = null;
    this.metricsService = null;
  }

  /**
   * Get observability status for engine status API
   */
  getStatus(): {
    counts: Record<string, number>;
    total: number;
    lastCeremonyAt: string | null;
  } {
    const total = Object.values(this.ceremonyCounts).reduce((a, b) => a + b, 0);
    return { counts: { ...this.ceremonyCounts }, total, lastCeremonyAt: this.lastCeremonyAt };
  }

  /**
   * Get reflection observability status (absorbed from ReflectionService)
   */
  getReflectionStatus(): {
    active: boolean;
    activeProject: string | null;
    reflectionCount: number;
    lastReflection: { projectTitle: string; projectSlug: string; completedAt: string } | null;
  } {
    return {
      active: this.activeReflection !== null,
      activeProject: this.activeReflection,
      reflectionCount: this.reflectionCount,
      lastReflection: this.lastReflection,
    };
  }

  /**
   * Clear processed project from dedup guard (used by retry endpoint)
   */
  clearProcessedProject(projectPath: string, projectSlug: string): void {
    const dedupeKey = `${projectPath}:${projectSlug}`;
    this.processedProjects.delete(dedupeKey);
    logger.info(`Cleared processed project: ${projectSlug}`);
  }

  /**
   * Set the audit log service for ceremony event tracking
   */
  setAuditLog(auditLog: CeremonyAuditLogService): void {
    this.auditLog = auditLog;
  }

  // ---------------------------------------------------------------------------
  // No-op stubs — overridden by the ceremony subclasses
  // ---------------------------------------------------------------------------

  protected handleEpicCreated(_payload: EpicCreatedEventPayload): Promise<void> {
    return Promise.resolve();
  }

  protected handleMilestoneStarted(_payload: MilestoneEventPayload): Promise<void> {
    return Promise.resolve();
  }

  protected handleMilestoneCompleted(_payload: MilestoneEventPayload): Promise<void> {
    return Promise.resolve();
  }

  protected handleEpicCompleted(_payload: EpicCompletedPayload): Promise<void> {
    return Promise.resolve();
  }

  protected handleProjectCompleted(_payload: ProjectCompletedPayload): Promise<void> {
    return Promise.resolve();
  }

  protected handlePostProjectDocs(_payload: ProjectCompletedPayload): Promise<void> {
    return Promise.resolve();
  }

  protected handleReviewCompleted(
    _payload: { projectPath: string; featureId: string; reviewNotes?: string },
    _verdict: 'approved' | 'changes_requested'
  ): Promise<void> {
    return Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  // Shared utility methods used by all ceremony subclasses
  // ---------------------------------------------------------------------------

  /**
   * Record a ceremony event to the audit log and emit ceremony:fired WebSocket event.
   * Returns the correlationId for Discord delivery tracking.
   */
  protected recordCeremony(
    ceremonyType: CeremonyAuditType,
    projectPath: string,
    discordSuccess: boolean,
    opts: {
      id?: string;
      projectSlug?: string;
      milestoneSlug?: string;
      featureId?: string;
      channelId?: string;
      title: string;
      summary?: string;
    }
  ): string {
    const id = opts.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    if (this.auditLog) {
      this.auditLog.record({
        id,
        timestamp: now,
        ceremonyType,
        projectPath,
        projectSlug: opts.projectSlug,
        milestoneSlug: opts.milestoneSlug,
        featureId: opts.featureId,
        discordChannelId: opts.channelId,
        deliveryStatus: discordSuccess ? 'pending' : 'skipped',
        payload: { title: opts.title, summary: opts.summary },
      });
    }

    if (this.emitter) {
      this.emitter.emit('ceremony:fired', {
        id,
        timestamp: now,
        ceremonyType,
        projectPath,
        projectSlug: opts.projectSlug,
        title: opts.title,
        deliveryStatus: discordSuccess ? 'pending' : 'skipped',
      });
    }

    return id;
  }

  /**
   * Get ceremony configuration for a project
   */
  protected async getCeremonySettings(projectPath: string): Promise<CeremonySettings | null> {
    if (!this.settingsService) return null;

    try {
      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      return projectSettings.ceremonySettings || null;
    } catch (error) {
      logger.error(`Failed to load ceremony config for ${projectPath}:`, error);
      return null;
    }
  }

  /**
   * Split message into chunks that fit Discord's 2000 char limit
   */
  protected splitMessage(content: string, maxLength: number): string[] {
    if (content.length <= maxLength) {
      return [content];
    }

    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Emit a Discord integration event.
   * Returns true if event was emitted, false if Discord is not configured or channelId is missing.
   */
  protected async emitDiscordEvent(
    projectPath: string,
    channelId: string | undefined,
    content: string,
    featureTitle: string,
    correlationId?: string
  ): Promise<boolean> {
    if (!this.emitter) {
      return false;
    }

    const projectSettings = await this.settingsService!.getProjectSettings(projectPath);
    const discordConfig = projectSettings.integrations?.discord;

    if (!discordConfig?.enabled) {
      logger.warn('Discord integration not enabled, cannot post ceremony');
      return false;
    }

    const finalChannelId = channelId || discordConfig.channelId;
    if (!finalChannelId) {
      logger.warn('No Discord channel ID configured, cannot post ceremony');
      return false;
    }

    const placeholderFeature = {
      id: 'milestone-ceremony',
      title: featureTitle,
    } as Feature;

    logger.info(`Emitting Discord ceremony event for: ${featureTitle}`);

    this.emitter.emit('integration:discord', {
      projectPath,
      featureId: 'milestone-ceremony',
      feature: placeholderFeature,
      serverId: discordConfig.serverId,
      channelId: finalChannelId,
      webhookId: discordConfig.webhookId,
      webhookToken: discordConfig.webhookToken,
      action: 'send_message',
      content,
      correlationId,
    });

    return true;
  }
}
