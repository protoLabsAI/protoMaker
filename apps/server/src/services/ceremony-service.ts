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
import { simpleQuery } from '../providers/simple-query-service.js';

const logger = createLogger('CeremonyService');

/**
 * Milestone event payload from the event system
 */
interface MilestoneEventPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  milestoneTitle: string;
  milestoneNumber: number;
}

/**
 * Project completion payload from the event system
 */
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

    // Subscribe to milestone and project lifecycle events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'milestone:started') {
        this.handleMilestoneStarted(payload as MilestoneEventPayload);
      } else if (type === 'milestone:completed') {
        this.handleMilestoneCompleted(payload as MilestoneEventPayload);
      } else if (type === 'project:completed') {
        this.handleProjectCompleted(payload as ProjectCompletedPayload);
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
   * Handle milestone:started event — post standup with planned scope
   */
  private async handleMilestoneStarted(payload: MilestoneEventPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug, milestoneTitle, milestoneNumber } = payload;

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableStandups) {
      logger.debug('Standups disabled, skipping milestone standup');
      return;
    }

    try {
      const content = await this.generateMilestoneStandup(
        projectPath,
        projectSlug,
        projectTitle,
        milestoneTitle,
        milestoneNumber
      );

      const messages = this.splitMessage(content, 2000);

      for (const message of messages) {
        await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Standup: Milestone ${milestoneNumber} — ${milestoneTitle}`
        );
      }

      logger.info(
        `Posted milestone standup for ${projectTitle} - Milestone ${milestoneNumber}: ${milestoneTitle}`
      );
    } catch (error) {
      logger.error('Failed to generate milestone standup:', error);
    }
  }

  /**
   * Handle milestone:completed event
   */
  private async handleMilestoneCompleted(payload: MilestoneEventPayload): Promise<void> {
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
   * Handle project:completed event
   * Generate a retrospective using LLM based on all project features and post to Discord
   */
  private async handleProjectCompleted(payload: ProjectCompletedPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug, totalMilestones, totalFeatures } = payload;

    // Check if ceremonies are enabled
    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableMilestoneUpdates) {
      logger.debug('Ceremonies disabled, skipping project retrospective');
      return;
    }

    try {
      // Load all features across all milestones
      const allFeatures = await this.featureLoader!.getAll(projectPath);

      // Aggregate stats
      const shipped = allFeatures.filter((f) => f.status === 'done' && f.prUrl);
      const failed = allFeatures.filter((f) => (f.failureCount || 0) > 0);
      const totalCost = allFeatures.reduce((sum, f) => sum + (f.costUsd || 0), 0);

      // Group by milestone for cost breakdown
      const milestoneBreakdown = new Map<string, { featureCount: number; costUsd: number }>();
      for (const feature of allFeatures) {
        if (feature.milestoneSlug) {
          const existing = milestoneBreakdown.get(feature.milestoneSlug) || {
            featureCount: 0,
            costUsd: 0,
          };
          milestoneBreakdown.set(feature.milestoneSlug, {
            featureCount: existing.featureCount + 1,
            costUsd: existing.costUsd + (feature.costUsd || 0),
          });
        }
      }

      // Build the data summary for the LLM
      const dataSummary = this.buildProjectDataSummary(
        projectTitle,
        totalMilestones,
        totalFeatures,
        shipped,
        failed,
        totalCost,
        milestoneBreakdown
      );

      // Get ceremony model (default: sonnet)
      const model = ceremonySettings.retroModel?.model || 'sonnet';

      // Call LLM with retrospective prompt
      const retroPrompt = `Given these project completion stats, write a concise retrospective covering:
- **What Went Well**: Highlight successes, efficient patterns, high-value features
- **What Went Wrong**: Identify failures, blockers, or inefficiencies
- **Lessons Learned**: Key takeaways from the project
- **Action Items**: Concrete improvements for future projects

Be specific, reference actual features and numbers from the data. Keep it engaging and actionable.

Project Data:
${dataSummary}`;

      logger.info(`Generating project retrospective for ${projectTitle} using model: ${model}`);
      const result = await simpleQuery({
        prompt: retroPrompt,
        model,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });
      const retrospective = result.text;

      // Format the retrospective with header
      const formattedRetro = `🎉 **${projectTitle}** — Project Complete!\n\n${retrospective}`;

      // Split into chunks if needed (Discord limit: 2000 chars)
      const messages = this.splitMessage(formattedRetro, 2000);

      // Post to Discord
      for (const message of messages) {
        await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Project Complete: ${projectTitle}`
        );
      }

      logger.info(`Posted project retrospective for ${projectTitle}`);
    } catch (error) {
      logger.error('Failed to generate project retrospective:', error);
    }
  }

  /**
   * Generate milestone standup content — planned scope, phases, and goals
   */
  private async generateMilestoneStandup(
    projectPath: string,
    projectSlug: string,
    projectTitle: string,
    milestoneTitle: string,
    milestoneNumber: number
  ): Promise<string> {
    const project = await this.projectService!.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project not found: ${projectSlug}`);
    }

    const milestone = project.milestones.find((m) => m.number === milestoneNumber);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneNumber} not found in project ${projectSlug}`);
    }

    const totalMilestones = project.milestones.length;
    const lines: string[] = [];

    // Header
    lines.push(`🚀 **${projectTitle}** — Milestone ${milestoneNumber}/${totalMilestones} Starting`);
    lines.push(`### Standup: ${milestoneTitle}\n`);

    // Scope
    lines.push(`**Planned Phases:** ${milestone.phases.length}`);
    if (milestone.phases.length > 0) {
      for (const phase of milestone.phases) {
        const complexity = phase.complexity ? ` [${phase.complexity}]` : '';
        lines.push(`- ${phase.title}${complexity}`);
      }
      lines.push('');
    }

    // Complexity breakdown
    const complexityCounts = { small: 0, medium: 0, large: 0 };
    for (const phase of milestone.phases) {
      if (phase.complexity && phase.complexity in complexityCounts) {
        complexityCounts[phase.complexity as keyof typeof complexityCounts]++;
      }
    }
    const complexityParts = Object.entries(complexityCounts)
      .filter(([, count]) => count > 0)
      .map(([level, count]) => `${count} ${level}`);
    if (complexityParts.length > 0) {
      lines.push(`**Complexity:** ${complexityParts.join(', ')}`);
    }

    // Progress context
    const completedMilestones = project.milestones.filter((m) => m.status === 'completed').length;
    if (completedMilestones > 0) {
      lines.push(`**Progress:** ${completedMilestones}/${totalMilestones} milestones done`);
    }

    // Description if available
    if (milestone.description) {
      lines.push('');
      lines.push(`**Goal:** ${milestone.description}`);
    }

    return lines.join('\n');
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
   * Build project data summary for LLM retrospective prompt
   */
  private buildProjectDataSummary(
    projectTitle: string,
    totalMilestones: number,
    totalFeatures: number,
    shipped: Feature[],
    failed: Feature[],
    totalCost: number,
    milestoneBreakdown: Map<string, { featureCount: number; costUsd: number }>
  ): string {
    const lines: string[] = [];

    // Project overview
    lines.push(`## ${projectTitle} — Project Overview`);
    lines.push(`- Total Milestones: ${totalMilestones}`);
    lines.push(`- Total Features: ${totalFeatures}`);
    lines.push(`- Total Cost: $${totalCost.toFixed(2)}`);
    lines.push('');

    // Features shipped
    lines.push(`### Features Shipped (${shipped.length})`);
    if (shipped.length > 0) {
      for (const feature of shipped) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl || 'No PR';
        const cost = feature.costUsd ? `$${feature.costUsd.toFixed(2)}` : '$0.00';
        lines.push(`- **${title}** — PR: ${prLink}, Cost: ${cost}`);
      }
    } else {
      lines.push('- None');
    }
    lines.push('');

    // Failures
    lines.push(`### Failures/Blockers (${failed.length})`);
    if (failed.length > 0) {
      for (const feature of failed) {
        const title = feature.title || 'Untitled';
        const failCount = feature.failureCount || 0;
        const error = feature.error ? `Error: ${feature.error.slice(0, 150)}` : '';
        lines.push(`- **${title}** — Fail Count: ${failCount}${error ? `, ${error}` : ''}`);
      }
    } else {
      lines.push('- None');
    }
    lines.push('');

    // Milestone breakdown
    lines.push(`### Milestone Cost Breakdown`);
    if (milestoneBreakdown.size > 0) {
      for (const [slug, data] of milestoneBreakdown) {
        lines.push(`- **${slug}**: ${data.featureCount} features, $${data.costUsd.toFixed(2)}`);
      }
    } else {
      lines.push('- No milestone data');
    }

    return lines.join('\n');
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
