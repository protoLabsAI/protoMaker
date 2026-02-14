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
import type { MetricsService } from './metrics-service.js';
import type { Feature, CeremonySettings } from '@automaker/types';
import { simpleQuery } from '../providers/simple-query-service.js';

const logger = createLogger('CeremonyService');

/**
 * Epic creation event payload from the event system
 */
interface EpicCreatedEventPayload {
  projectPath: string;
  projectSlug: string;
  milestoneSlug: string;
  epicId: string;
}

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
 * Epic completion payload from the event system
 */
interface EpicCompletedPayload {
  projectPath: string;
  featureId: string;
  featureTitle: string;
  isEpic: true;
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
  private metricsService: MetricsService | null = null;
  private unsubscribe: (() => void) | null = null;

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

    // Subscribe to epic, milestone, and project lifecycle events
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
      } else if (type === 'authority:pm-review-approved') {
        this.handleReviewCompleted(
          payload as {
            projectPath: string;
            featureId: string;
            reviewNotes?: string;
          },
          'approved'
        );
      } else if (type === 'authority:pm-review-changes-requested') {
        this.handleReviewCompleted(
          payload as {
            projectPath: string;
            featureId: string;
            reviewNotes?: string;
          },
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
   * Handle epic creation event — post kickoff announcement with scope and complexity
   */
  private async handleEpicCreated(payload: EpicCreatedEventPayload): Promise<void> {
    const { projectPath, projectSlug, milestoneSlug } = payload;

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableEpicKickoff) {
      logger.debug('Epic kickoffs disabled, skipping epic kickoff');
      return;
    }

    try {
      // Load project to get milestone data
      const project = await this.projectService!.getProject(projectPath, projectSlug);
      if (!project) {
        logger.warn(`Project not found: ${projectSlug}`);
        return;
      }

      // Find the milestone by slug
      const milestone = project.milestones.find((m) => m.slug === milestoneSlug);
      if (!milestone) {
        logger.warn(`Milestone not found for epic: ${milestoneSlug}`);
        return;
      }

      // Generate the epic kickoff content
      const content = this.generateEpicKickoff(project.title, milestone);

      const messages = this.splitMessage(content, 2000);

      for (const message of messages) {
        await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Epic Kickoff: ${milestone.title}`
        );
      }

      logger.info(`Posted epic kickoff for ${project.title} - Epic: ${milestone.title}`);
    } catch (error) {
      logger.error('Failed to generate epic kickoff:', error);
    }
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
   * Handle feature:completed event for epics
   * Generate an epic delivery announcement with child features, PRs, cost, and duration
   */
  private async handleEpicCompleted(payload: EpicCompletedPayload): Promise<void> {
    const { projectPath, featureId, featureTitle } = payload;

    // Check if ceremonies are enabled
    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableEpicDelivery) {
      logger.debug('Epic delivery ceremonies disabled, skipping announcement');
      return;
    }

    try {
      // Load the epic feature to get full details
      const epic = await this.featureLoader!.get(projectPath, featureId);
      if (!epic) {
        logger.warn(`Epic ${featureId} not found for announcement`);
        return;
      }

      // Generate the epic delivery announcement
      const content = await this.generateEpicDeliveryAnnouncement(projectPath, epic);

      // Split into chunks if needed (Discord limit: 2000 chars)
      const messages = this.splitMessage(content, 2000);

      // Emit Discord events for each message chunk
      for (const message of messages) {
        await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Epic Delivered: ${featureTitle}`
        );
      }

      logger.info(`Posted epic delivery announcement for "${featureTitle}"`);
    } catch (error) {
      logger.error('Failed to generate epic delivery announcement:', error);
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

      // Generate Project Impact Report
      let impactReport = '';
      if (this.metricsService) {
        try {
          impactReport = await this.metricsService.generateImpactReport(projectPath);
        } catch (error) {
          logger.error('Failed to generate impact report:', error);
        }
      }

      // Format the retrospective with header and impact report
      let formattedRetro = `🎉 **${projectTitle}** — Project Complete!\n\n${retrospective}`;

      if (impactReport) {
        formattedRetro += `\n\n---\n\n${impactReport}`;
      }

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

      logger.info(`Posted project retrospective with impact report for ${projectTitle}`);
    } catch (error) {
      logger.error('Failed to generate project retrospective:', error);
    }
  }

  /**
   * Generate epic kickoff announcement — title, planned phases, complexity breakdown, estimated scope
   */
  private generateEpicKickoff(
    projectTitle: string,
    milestone: {
      title: string;
      description?: string;
      phases: Array<{ title: string; complexity?: string }>;
    }
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`🎯 **${projectTitle}** — Epic Kickoff`);
    lines.push(`### ${milestone.title}\n`);

    // Description if available
    if (milestone.description) {
      lines.push(`**Overview:** ${milestone.description}\n`);
    }

    // Planned phases
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
      lines.push(`**Complexity Breakdown:** ${complexityParts.join(', ')}`);
    }

    // Estimated scope
    const totalPhases = milestone.phases.length;
    lines.push(
      `**Estimated Scope:** ${totalPhases} phase${totalPhases !== 1 ? 's' : ''} to deliver`
    );

    return lines.join('\n');
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
   * Generate epic delivery announcement with child features, PRs, cost, and duration
   */
  private async generateEpicDeliveryAnnouncement(
    projectPath: string,
    epic: Feature
  ): Promise<string> {
    // Load all features to find children
    const allFeatures = await this.featureLoader!.getAll(projectPath);
    const childFeatures = allFeatures.filter((f) => f.epicId === epic.id && f.id !== epic.id);

    // Calculate metrics
    const totalCost = childFeatures.reduce((sum, f) => sum + (f.costUsd || 0), 0);
    const featureCount = childFeatures.length;
    const prLinks = childFeatures.filter((f) => f.prUrl && f.prNumber).map((f) => f.prUrl);

    // Calculate duration from earliest start to now
    let duration = '';
    if (childFeatures.length > 0 && childFeatures[0].startedAt) {
      const startTimes = childFeatures
        .map((f) => (f.startedAt ? new Date(f.startedAt).getTime() : 0))
        .filter((t) => t > 0);
      if (startTimes.length > 0) {
        const earliestStart = Math.min(...startTimes);
        const durationMs = Date.now() - earliestStart;
        const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
        const durationDays = Math.floor(durationHours / 24);

        if (durationDays > 0) {
          duration = `${durationDays}d ${durationHours % 24}h`;
        } else {
          duration = `${durationHours}h`;
        }
      }
    }

    // Build the announcement
    const lines: string[] = [];

    // Header
    lines.push(`🎁 **${epic.title}** — Epic Delivered!`);
    lines.push('');

    // Child features shipped
    lines.push(`**Features Shipped:** ${featureCount}`);
    if (childFeatures.length > 0) {
      for (const feature of childFeatures) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        lines.push(`- ${title} — ${prLink}`);
      }
      lines.push('');
    }

    // Cost metrics
    if (totalCost > 0) {
      lines.push(`**Total Cost:** $${totalCost.toFixed(2)}`);
      const avgCost = featureCount > 0 ? totalCost / featureCount : 0;
      lines.push(`**Avg per Feature:** $${avgCost.toFixed(2)}`);
      lines.push('');
    }

    // Duration
    if (duration) {
      lines.push(`**Duration:** ${duration}`);
      lines.push('');
    }

    // Cost rollup summary
    if (childFeatures.length > 0) {
      const shippedCount = childFeatures.filter((f) => f.status === 'done' && f.prUrl).length;
      lines.push(`**Shipped:** ${shippedCount}/${featureCount} features with PRs`);
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
   * Handle review completed events — generate content brief for GTM
   * This creates a blog outline from the review process for marketing purposes
   */
  private async handleReviewCompleted(
    payload: {
      projectPath: string;
      featureId: string;
      reviewNotes?: string;
    },
    verdict: 'approved' | 'changes_requested'
  ): Promise<void> {
    const { projectPath, featureId, reviewNotes } = payload;

    // Check if ceremonies are enabled
    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled) {
      logger.debug('Ceremonies disabled, skipping content brief generation');
      return;
    }

    try {
      // Load the feature to get PRD content
      const feature = await this.featureLoader!.get(projectPath, featureId);
      if (!feature) {
        logger.warn(`Feature ${featureId} not found for content brief`);
        return;
      }

      // Generate content brief using LLM
      const contentBrief = await this.generateContentBrief(
        projectPath,
        feature,
        verdict,
        reviewNotes
      );

      // Post to Discord
      const messages = this.splitMessage(contentBrief, 2000);
      for (const message of messages) {
        await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Content Brief: ${feature.title}`
        );
      }

      logger.info(`Posted content brief for feature "${feature.title}"`);
    } catch (error) {
      logger.error('Failed to generate content brief:', error);
    }
  }

  /**
   * Generate content brief (blog outline) from review process
   * Uses LLM to create GTM-ready content outline based on PRD and review
   */
  private async generateContentBrief(
    projectPath: string,
    feature: Feature,
    verdict: 'approved' | 'changes_requested',
    reviewNotes?: string
  ): Promise<string> {
    const model = 'sonnet'; // Use Sonnet for content generation

    // Build the prompt for content brief generation
    const prompt = `You are a content strategist creating a blog outline for a Go-To-Market campaign.

Based on this PRD and review process, create a compelling blog post outline that:
1. Explains the problem being solved
2. Highlights the solution's key benefits
3. Describes the technical approach at a high level
4. Provides a clear call-to-action

**Feature Title:** ${feature.title}

**PRD Description:**
${feature.description || 'No description provided'}

**Complexity:** ${feature.complexity || 'Not specified'}

**Review Verdict:** ${verdict === 'approved' ? 'APPROVED' : 'CHANGES REQUESTED'}

${reviewNotes ? `**Review Notes:**\n${reviewNotes}` : ''}

Generate a structured blog outline with:
- Catchy title
- Hook/opening paragraph
- 3-5 main sections with bullet points
- Conclusion with CTA

Keep it engaging, benefits-focused, and suitable for a technical audience.`;

    logger.info(`Generating content brief for "${feature.title}" using model: ${model}`);

    const result = await simpleQuery({
      prompt,
      model,
      cwd: projectPath,
      maxTurns: 1,
      allowedTools: [],
    });

    const outline = result.text;

    // Format the output with header
    const verdictEmoji = verdict === 'approved' ? '✅' : '⚠️';
    return `${verdictEmoji} **Content Brief Generated**: ${feature.title}\n\n${outline}`;
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
