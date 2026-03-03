/**
 * CeremonyService — event-driven orchestrator for LangGraph ceremony flows.
 *
 * Replaces the ceremony class hierarchy (CeremonyBase → StandupCeremony →
 * RetroCeremony → ProjectRetroCeremony) with a flat class that subscribes to
 * the same events and invokes the appropriate LangGraph flow factory functions.
 *
 * Public interface is identical to the old hierarchy so consumers
 * (routes, services.ts, engine routes, integration-service) require no changes.
 */

import { createLogger } from '@protolabs-ai/utils';
import { ChatAnthropic } from '@langchain/anthropic';
import { createStandupFlow, createRetroFlow, createProjectRetroFlow } from '@protolabs-ai/flows';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import type { MetricsService } from './metrics-service.js';
import type { CeremonyAuditLogService } from './ceremony-audit-service.js';

const logger = createLogger('CeremonyService');

// ---------------------------------------------------------------------------
// Minimal event payload shapes (mirrors the original ceremony-base.ts types)
// ---------------------------------------------------------------------------

interface MilestoneEventPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  milestoneTitle: string;
  milestoneNumber: number;
  featureCount?: number;
  totalCostUsd?: number;
  failureCount?: number;
  prUrls?: string[];
  featureSummaries?: Array<{
    id: string;
    title: string;
    status: string;
    costUsd: number;
    prUrl?: string;
    failureCount?: number;
  }>;
}

interface ProjectCompletedPayload {
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

// ---------------------------------------------------------------------------
// EventEmitter-based discordBot adapter
// Satisfies StandupDiscordBot / RetroDiscordBot structural interfaces without
// a hard dependency on DiscordBotService.
// ---------------------------------------------------------------------------

function createDiscordAdapter(emitter: EventEmitter) {
  return {
    sendMessage: async (channelId: string, content: string): Promise<{ id: string }> => {
      emitter.emit('integration:discord', {
        channelId,
        content,
        action: 'send_message',
      });
      return { id: '' };
    },
  };
}

// ---------------------------------------------------------------------------
// CeremonyService
// ---------------------------------------------------------------------------

export class CeremonyService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private projectService: ProjectService | null = null;
  private auditLog: CeremonyAuditLogService | null = null;
  private unsubscribe: (() => void) | null = null;

  // Observability counters (same shape as old CeremonyBase.ceremonyCounts)
  private ceremonyCounts = {
    epicKickoff: 0,
    standup: 0,
    milestoneRetro: 0,
    epicDelivery: 0,
    contentBrief: 0,
    projectRetro: 0,
    postProjectDocs: 0,
    discordPostFailures: 0,
  };
  private lastCeremonyAt: string | null = null;

  // Reflection observability state
  private lastReflection: {
    projectTitle: string;
    projectSlug: string;
    completedAt: string;
  } | null = null;
  private reflectionCount = 0;
  private activeReflection: string | null = null;

  // Dedup guard for project retros
  private processedProjects = new Set<string>();

  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    projectService: ProjectService,
    _metricsService: MetricsService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.projectService = projectService;

    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'milestone:started') {
        this.handleMilestoneStarted(payload as MilestoneEventPayload).catch((err) =>
          logger.warn('Standup flow error:', err)
        );
      } else if (type === 'milestone:completed') {
        this.handleMilestoneCompleted(payload as MilestoneEventPayload).catch((err) =>
          logger.warn('Retro flow error:', err)
        );
      } else if (type === 'project:completed') {
        this.handleProjectCompleted(payload as ProjectCompletedPayload).catch((err) =>
          logger.warn('Project retro flow error:', err)
        );
      }
    });

    logger.info('Ceremony service initialized (LangGraph flows)');
  }

  setAuditLog(auditLog: CeremonyAuditLogService): void {
    this.auditLog = auditLog;
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.settingsService = null;
    this.featureLoader = null;
    this.projectService = null;
  }

  getStatus(): {
    counts: Record<string, number>;
    total: number;
    lastCeremonyAt: string | null;
  } {
    const total = Object.values(this.ceremonyCounts).reduce((a, b) => a + b, 0);
    return { counts: { ...this.ceremonyCounts }, total, lastCeremonyAt: this.lastCeremonyAt };
  }

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

  clearProcessedProject(projectPath: string, projectSlug: string): void {
    const key = `${projectPath}:${projectSlug}`;
    this.processedProjects.delete(key);
    logger.info(`Cleared processed project: ${projectSlug}`);
  }

  // ---------------------------------------------------------------------------
  // Private event handlers — delegate to LangGraph flows
  // ---------------------------------------------------------------------------

  /**
   * Resolve the ceremony Discord channel ID.
   * Prefers DiscordIntegrationConfig.channels.ceremonies, falls back to CeremonySettings.discordChannelId.
   */
  private async getCeremonyChannelId(projectPath: string): Promise<string | undefined> {
    if (!this.settingsService) return undefined;
    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const discordConfig = projectSettings.integrations?.discord;
    const ceremonySettings = projectSettings.ceremonySettings;
    return discordConfig?.channels?.ceremonies || ceremonySettings?.discordChannelId;
  }

  private async handleMilestoneStarted(payload: MilestoneEventPayload): Promise<void> {
    if (!this.projectService || !this.settingsService || !this.emitter) return;

    const { projectPath, projectSlug, projectTitle, milestoneTitle, milestoneNumber } = payload;
    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const ceremonySettings = projectSettings.ceremonySettings;
    if (!ceremonySettings?.enabled) {
      logger.debug('Ceremonies disabled, skipping standup');
      return;
    }
    const discordChannelId = await this.getCeremonyChannelId(projectPath);
    if (!discordChannelId) {
      logger.debug('No Discord channel configured, skipping standup');
      return;
    }

    const milestoneSlug = milestoneTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    logger.info(`Running standup flow for milestone "${milestoneTitle}" in ${projectTitle}`);
    this.ceremonyCounts.standup++;
    this.lastCeremonyAt = new Date().toISOString();

    const correlationId = `standup-${projectSlug}-${milestoneSlug}-${Date.now()}`;
    try {
      const modelId = ceremonySettings.retroModel?.model ?? 'claude-sonnet-4-6';
      const model = new ChatAnthropic({ model: modelId });
      const flow = createStandupFlow({
        projectService: this.projectService,
        model,
        discordBot: createDiscordAdapter(this.emitter),
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
      });
      await flow.invoke({});
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'standup',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'delivered',
        payload: {
          title: `Standup: ${milestoneTitle}`,
          summary: `Milestone ${milestoneNumber} standup for ${projectTitle}`,
        },
      });
      this.emitter?.emit('ceremony:fired', {
        type: 'standup',
        projectSlug,
        milestoneSlug,
        projectPath,
      });
    } catch (err) {
      this.ceremonyCounts.discordPostFailures++;
      logger.warn(`Standup flow failed: ${err instanceof Error ? err.message : String(err)}`);
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'standup',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        payload: { title: `Standup: ${milestoneTitle}` },
      });
    }
  }

  private async handleMilestoneCompleted(payload: MilestoneEventPayload): Promise<void> {
    if (!this.featureLoader || !this.settingsService || !this.emitter) return;

    const { projectPath, projectSlug, projectTitle, milestoneTitle, milestoneNumber } = payload;
    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const ceremonySettings = projectSettings.ceremonySettings;
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableMilestoneUpdates) {
      logger.debug('Milestone retros disabled, skipping');
      return;
    }
    const discordChannelId = await this.getCeremonyChannelId(projectPath);
    if (!discordChannelId) {
      logger.debug('No Discord channel configured, skipping retro');
      return;
    }

    const milestoneSlug = milestoneTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    logger.info(`Running retro flow for milestone "${milestoneTitle}" in ${projectTitle}`);
    this.ceremonyCounts.milestoneRetro++;
    this.lastCeremonyAt = new Date().toISOString();

    const correlationId = `retro-${projectSlug}-${milestoneSlug}-${Date.now()}`;
    try {
      const modelId = ceremonySettings.retroModel?.model ?? 'claude-sonnet-4-6';
      const model = new ChatAnthropic({ model: modelId });
      const flow = createRetroFlow({
        featureLoader: this.featureLoader,
        model,
        discordBot: createDiscordAdapter(this.emitter),
        projectPath,
        projectSlug,
        milestoneSlug,
        milestoneTitle,
        milestoneNumber,
        projectTitle,
        discordChannelId,
      });
      await flow.invoke({});
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'milestone_retro',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'delivered',
        payload: {
          title: `Retro: ${milestoneTitle}`,
          summary: `Milestone ${milestoneNumber} retro for ${projectTitle}`,
        },
      });
      this.emitter?.emit('ceremony:fired', {
        type: 'milestone_retro',
        projectSlug,
        milestoneSlug,
        projectPath,
      });
    } catch (err) {
      this.ceremonyCounts.discordPostFailures++;
      logger.warn(`Retro flow failed: ${err instanceof Error ? err.message : String(err)}`);
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'milestone_retro',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        payload: { title: `Retro: ${milestoneTitle}` },
      });
    }
  }

  private async handleProjectCompleted(payload: ProjectCompletedPayload): Promise<void> {
    if (!this.featureLoader || !this.settingsService || !this.emitter) return;

    const { projectPath, projectSlug, projectTitle } = payload;
    const dedupeKey = `${projectPath}:${projectSlug}`;
    if (this.processedProjects.has(dedupeKey)) {
      logger.debug(`Project retro already processed for ${projectSlug}, skipping`);
      return;
    }

    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const ceremonySettings = projectSettings.ceremonySettings;
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableProjectRetros) {
      logger.debug('Project retros disabled, skipping');
      return;
    }
    const discordChannelId = await this.getCeremonyChannelId(projectPath);
    if (!discordChannelId) {
      logger.debug('No Discord channel configured, skipping project retro');
      return;
    }

    this.processedProjects.add(dedupeKey);
    this.activeReflection = projectTitle;
    this.ceremonyCounts.projectRetro++;
    this.lastCeremonyAt = new Date().toISOString();
    logger.info(`Running project retro flow for "${projectTitle}"`);

    const correlationId = `project-retro-${projectSlug}-${Date.now()}`;
    try {
      const modelId = ceremonySettings.retroModel?.model ?? 'claude-sonnet-4-6';
      const model = new ChatAnthropic({ model: modelId });
      const flow = createProjectRetroFlow({
        featureLoader: this.featureLoader,
        model,
        discordBot: createDiscordAdapter(this.emitter),
        projectPath,
        projectSlug,
        projectTitle,
        totalMilestones: payload.totalMilestones,
        totalFeatures: payload.totalFeatures,
        discordChannelId,
      });
      await flow.invoke({});

      this.reflectionCount++;
      this.lastReflection = {
        projectTitle,
        projectSlug,
        completedAt: new Date().toISOString(),
      };
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'project_retro',
        projectPath,
        projectSlug,
        discordChannelId,
        deliveryStatus: 'delivered',
        payload: {
          title: `Project Retro: ${projectTitle}`,
          summary: `${payload.totalMilestones} milestones, ${payload.totalFeatures} features`,
        },
      });
      this.emitter?.emit('ceremony:fired', { type: 'project_retro', projectSlug, projectPath });
    } catch (err) {
      this.ceremonyCounts.discordPostFailures++;
      logger.warn(`Project retro flow failed: ${err instanceof Error ? err.message : String(err)}`);
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'project_retro',
        projectPath,
        projectSlug,
        discordChannelId,
        deliveryStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        payload: { title: `Project Retro: ${projectTitle}` },
      });
    } finally {
      this.activeReflection = null;
    }
  }
}

// Singleton instance (matches original export shape)
export const ceremonyService = new CeremonyService();
