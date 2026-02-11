/**
 * Ceremony Service - Generates milestone completion ceremonies
 *
 * Subscribes to milestone:completed events and posts detailed updates to Discord
 * with features shipped, cost metrics, duration, blockers, and next steps.
 *
 * Replaces the simple one-liner in IntegrationService with rich, formatted content.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import type { Feature, CeremonySettings } from '@automaker/types';

const logger = createLogger('CeremonyService');

/**
 * Milestone completion payload from the event system
 */
interface MilestoneCompletedPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  milestoneTitle: string;
  milestoneNumber: number;
}

/**
 * Ceremony Service
 *
 * Generates rich milestone completion announcements with:
 * - Project and milestone info
 * - Features shipped with PR links
 * - Cost and duration metrics
 * - Blockers encountered
 * - Next milestone preview
 */
export class CeremonyService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private projectService: ProjectService | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the service with dependencies
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    projectService: ProjectService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.projectService = projectService;

    // Subscribe to milestone:completed events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'milestone:completed') {
        this.handleMilestoneCompleted(payload as MilestoneCompletedPayload);
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
  }

  /**
   * Handle milestone:completed event
   */
  private async handleMilestoneCompleted(payload: MilestoneCompletedPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug, milestoneTitle, milestoneNumber } = payload;

    // Check if ceremonies are enabled
    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableMilestoneUpdates) {
      logger.debug('Ceremonies disabled, skipping milestone update');
      return;
    }

    try {
      // Generate the ceremony content
      const content = await this.generateMilestoneCeremony(
        projectPath,
        projectSlug,
        projectTitle,
        milestoneTitle,
        milestoneNumber
      );

      // Split into chunks if needed (Discord limit: 2000 chars)
      const messages = this.splitMessage(content, 2000);

      // Emit Discord events for each message chunk
      for (const message of messages) {
        await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Milestone ${milestoneNumber}: ${milestoneTitle}`
        );
      }

      logger.info(
        `Posted milestone ceremony for ${projectTitle} - Milestone ${milestoneNumber}: ${milestoneTitle}`
      );
    } catch (error) {
      logger.error('Failed to generate milestone ceremony:', error);
    }
  }

  /**
   * Generate rich milestone completion content
   */
  private async generateMilestoneCeremony(
    projectPath: string,
    projectSlug: string,
    projectTitle: string,
    milestoneTitle: string,
    milestoneNumber: number
  ): Promise<string> {
    // Load project to get milestone data
    const project = await this.projectService!.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project not found: ${projectSlug}`);
    }

    // Find the completed milestone
    const milestone = project.milestones.find((m) => m.number === milestoneNumber);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneNumber} not found in project ${projectSlug}`);
    }

    // Collect features for this milestone
    const features = await this.getMilestoneFeatures(projectPath, milestone.slug);

    // Calculate metrics
    const totalCost = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);
    const featureCount = features.length;
    const totalMilestones = project.milestones.length;

    // Find blockers (features that failed or were blocked)
    const blockedFeatures = features.filter((f) => f.error || f.status === 'blocked');

    // Find next milestone
    const nextMilestone = project.milestones.find((m) => m.number === milestoneNumber + 1);

    // Build the ceremony message
    const lines: string[] = [];

    // Header
    lines.push(`🏁 **${projectTitle}** — Milestone ${milestoneNumber}/${totalMilestones} Complete`);
    lines.push(`### ${milestoneTitle}\n`);

    // Features shipped
    lines.push(`**Features Shipped:** ${featureCount}`);
    if (features.length > 0) {
      for (const feature of features) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        lines.push(`- ${title} — ${prLink}`);
      }
      lines.push('');
    }

    // Cost metrics
    if (totalCost > 0) {
      lines.push(`**Total Cost:** $${totalCost.toFixed(2)}`);
      const avgCost = totalCost / featureCount;
      lines.push(`**Avg per Feature:** $${avgCost.toFixed(2)}`);
      lines.push('');
    }

    // Duration
    if (features.length > 0 && features[0].startedAt) {
      const startTimes = features
        .map((f) => (f.startedAt ? new Date(f.startedAt).getTime() : 0))
        .filter((t) => t > 0);
      if (startTimes.length > 0) {
        const earliestStart = Math.min(...startTimes);
        const duration = Date.now() - earliestStart;
        const durationHours = Math.floor(duration / (1000 * 60 * 60));
        const durationDays = Math.floor(durationHours / 24);

        if (durationDays > 0) {
          lines.push(`**Duration:** ${durationDays}d ${durationHours % 24}h`);
        } else {
          lines.push(`**Duration:** ${durationHours}h`);
        }
        lines.push('');
      }
    }

    // Blockers
    if (blockedFeatures.length > 0) {
      lines.push(`**Blockers Encountered:** ${blockedFeatures.length}`);
      for (const feature of blockedFeatures) {
        const title = feature.title || 'Untitled';
        const error = feature.error ? ` — ${feature.error.slice(0, 100)}` : '';
        lines.push(`- ${title}${error}`);
      }
      lines.push('');
    }

    // What's next
    if (nextMilestone) {
      lines.push(`**What's Next:** Milestone ${nextMilestone.number} — ${nextMilestone.title}`);
      lines.push(`${nextMilestone.phases.length} phases planned`);
    } else {
      lines.push(`**Project Status:** All milestones complete! 🎉`);
    }

    return lines.join('\n');
  }

  /**
   * Get all features for a milestone
   */
  private async getMilestoneFeatures(
    projectPath: string,
    milestoneSlug: string
  ): Promise<Feature[]> {
    // Load all features and filter by milestone
    const allFeatures = await this.featureLoader!.getAll(projectPath);
    return allFeatures.filter((f) => f.milestoneSlug === milestoneSlug);
  }

  /**
   * Get ceremony configuration for a project
   */
  private async getCeremonySettings(projectPath: string): Promise<CeremonySettings | null> {
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
  private splitMessage(content: string, maxLength: number): string[] {
    if (content.length <= maxLength) {
      return [content];
    }

    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      // If adding this line would exceed the limit, start a new chunk
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
   * Emit a Discord integration event
   */
  private async emitDiscordEvent(
    projectPath: string,
    channelId: string | undefined,
    content: string,
    featureTitle: string
  ): Promise<void> {
    if (!this.emitter) return;

    // Get Discord config from project settings
    const projectSettings = await this.settingsService!.getProjectSettings(projectPath);
    const discordConfig = projectSettings.integrations?.discord;

    if (!discordConfig?.enabled) {
      logger.warn('Discord integration not enabled, cannot post ceremony');
      return;
    }

    // Create a placeholder feature for the event
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
      channelId: channelId || discordConfig.channelId,
      webhookId: discordConfig.webhookId,
      webhookToken: discordConfig.webhookToken,
      action: 'send_message',
      content,
    });
  }
}

// Singleton instance
export const ceremonyService = new CeremonyService();
