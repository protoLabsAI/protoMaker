/**
 * Ceremony Service - Generates milestone completion ceremonies
 *
 * Subscribes to milestone:completed events and posts detailed updates to Discord
 * with features shipped, cost metrics, duration, blockers, and next steps.
 *
 * Replaces the simple one-liner in IntegrationService with rich, formatted content.
 */

import {
  createLogger,
  appendLearning,
  type LearningEntry,
  type MemoryFsModule,
} from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import type { MetricsService } from './metrics-service.js';
import type { Feature, CeremonySettings } from '@automaker/types';
import { simpleQuery } from '../providers/simple-query-service.js';
import { BeadsService } from './beads-service.js';
import { LinearProjectUpdateService } from './linear-project-update-service.js';
import { secureFs } from '@automaker/platform';
import path from 'path';
import fs from 'fs/promises';

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
 * Improvement item from retro analysis
 */
interface ImprovementItem {
  title: string;
  description: string;
  type: 'operational' | 'code';
  priority: number;
  category?: string;
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
  private beadsService: BeadsService | null = null;
  private linearProjectUpdateService: LinearProjectUpdateService | null = null;
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
    this.beadsService = new BeadsService('bd', emitter);
    // LinearProjectUpdateService will be initialized per-project as needed

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

      // Post to Linear project update if enabled
      if (ceremonySettings.enableLinearProjectUpdates && this.settingsService) {
        try {
          const linearService = new LinearProjectUpdateService(this.settingsService, projectPath);
          if (await linearService.isEnabled()) {
            await linearService.createDailyStandup(content);
            logger.info(`Posted milestone standup to Linear project for ${projectTitle}`);
          }
        } catch (error) {
          logger.error('Failed to post standup to Linear project:', error);
        }
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

      // Load milestone features to check for blockers
      const project = await this.projectService!.getProject(projectPath, projectSlug);
      const milestone = project?.milestones.find((m) => m.number === milestoneNumber);
      let hasBlockers = false;
      if (milestone) {
        const milestoneFeatures = await this.getMilestoneFeatures(projectPath, milestone.slug);
        hasBlockers = milestoneFeatures.some((f) => f.error || f.status === 'blocked');

        // Post to Linear project update if enabled
        if (ceremonySettings.enableLinearProjectUpdates && this.settingsService) {
          try {
            const linearService = new LinearProjectUpdateService(this.settingsService, projectPath);
            if (await linearService.isEnabled()) {
              await linearService.createMilestoneCompletion(content, hasBlockers);
              logger.info(`Posted milestone completion to Linear project for ${projectTitle}`);
            }
          } catch (error) {
            logger.error('Failed to post milestone completion to Linear project:', error);
          }
        }

        // Generate and post content brief
        await this.generateAndPostMilestoneContentBrief(
          projectPath,
          projectSlug,
          projectTitle,
          milestoneTitle,
          milestoneNumber,
          milestoneFeatures,
          ceremonySettings
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
   * Generate and post a content brief to the GTM channel when a milestone completes.
   * Uses LLM to create a structured content brief that Jon/GTM can pick up.
   */
  private async generateAndPostMilestoneContentBrief(
    projectPath: string,
    projectSlug: string,
    projectTitle: string,
    milestoneTitle: string,
    milestoneNumber: number,
    features: Feature[],
    ceremonySettings: CeremonySettings
  ): Promise<void> {
    if (!ceremonySettings.enableContentBriefs) {
      logger.debug('Content briefs disabled, skipping');
      return;
    }

    const channelId = ceremonySettings.contentBriefChannelId;
    if (!channelId) {
      logger.debug('No contentBriefChannelId configured, skipping content brief');
      return;
    }

    try {
      const shipped = features.filter((f) => f.status === 'done' && f.prUrl);
      const totalCost = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);

      // Build feature summary for the prompt
      const featureSummary = shipped
        .map((f) => `- ${f.title}: ${f.description?.slice(0, 200) || 'No description'}`)
        .join('\n');

      const prompt = `You are a content strategist creating a content brief for a Go-To-Market team.

A development milestone just completed. Create a structured content brief that a GTM specialist can use to produce blog posts, tweets, or case study material.

**Project:** ${projectTitle}
**Milestone ${milestoneNumber}:** ${milestoneTitle}
**Features Shipped:** ${shipped.length}
**Total Cost:** $${totalCost.toFixed(2)}

**Features:**
${featureSummary || 'No features with descriptions'}

Generate a content brief with:
1. **Headline**: A compelling one-liner for this milestone
2. **Key Message**: The main takeaway in 2-3 sentences
3. **Audience**: Who cares about this and why
4. **Content Angles**: 3-4 possible content pieces (blog post, tweet thread, case study section, etc.) with a one-line description of each
5. **Technical Highlights**: 2-3 notable technical achievements to emphasize
6. **Suggested Visuals**: What diagrams, screenshots, or graphics would strengthen the content

Keep it concise, actionable, and focused on what makes this milestone interesting to an external audience.`;

      const model = ceremonySettings.retroModel?.model || 'sonnet';
      logger.info(`Generating content brief for milestone ${milestoneNumber}: ${milestoneTitle}`);

      const result = await simpleQuery({
        prompt,
        model,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      const brief = result.text;
      const formatted = `📝 **Content Brief** — ${projectTitle} / Milestone ${milestoneNumber}: ${milestoneTitle}\n\n${brief}`;

      // Post to the dedicated content-briefs channel
      const messages = this.splitMessage(formatted, 2000);
      for (const message of messages) {
        await this.emitDiscordEvent(
          projectPath,
          channelId,
          message,
          `Content Brief: ${milestoneTitle}`
        );
      }

      logger.info(`Posted content brief to GTM channel for milestone: ${milestoneTitle}`);
    } catch (error) {
      logger.error('Failed to generate milestone content brief:', error);
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

      // Generate reflection loop - synthesize agent memory into project-level learning summary
      try {
        await this.generateReflectionLoop(projectPath, projectTitle, model);
      } catch (error) {
        logger.error('Failed to generate reflection loop summary:', error);
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

      // Extract and create improvement items (closes the REFLECT → REPEAT loop)
      await this.createImprovementItems(projectPath, projectTitle, retrospective, dataSummary);
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
   * Generate reflection loop - synthesize agent memory into project-level learning summary
   * Collects all .automaker/memory/*.md entries, synthesizes into 1-page summary, stores in project directory
   */
  private async generateReflectionLoop(
    projectPath: string,
    projectTitle: string,
    model: string
  ): Promise<void> {
    logger.info(`Generating reflection loop for project: ${projectTitle}`);

    // Collect all memory files
    const memoryDir = path.join(projectPath, '.automaker', 'memory');
    let memoryFiles: string[] = [];

    try {
      const entries = await secureFs.readdir(memoryDir, { withFileTypes: true });
      memoryFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No memory directory found, skipping reflection loop');
        return;
      }
      throw error;
    }

    if (memoryFiles.length === 0) {
      logger.info('No memory files found, skipping reflection loop');
      return;
    }

    // Read all memory file contents
    const memoryEntries = await this.collectMemoryEntries(memoryDir, memoryFiles);

    // Synthesize into project-level learning summary
    const learningSummary = await this.synthesizeLearningSummary(
      projectTitle,
      memoryEntries,
      model
    );

    // Store summary in project directory
    await this.storeLearningSummary(projectPath, projectTitle, learningSummary);

    // Persist structured learnings to .automaker/memory/ for future agents
    await this.persistToAgentMemory(projectPath, projectTitle, learningSummary);

    // Post completion update to Linear project if configured
    await this.postCompletionToLinear(projectPath, projectTitle);

    logger.info(`Reflection loop complete for ${projectTitle}`);
  }

  /**
   * Collect and parse memory entries from all memory files
   */
  private async collectMemoryEntries(
    memoryDir: string,
    memoryFiles: string[]
  ): Promise<Array<{ filename: string; content: string }>> {
    const entries: Array<{ filename: string; content: string }> = [];

    for (const filename of memoryFiles) {
      try {
        const filePath = path.join(memoryDir, filename);
        const rawContent = await secureFs.readFile(filePath, 'utf-8');
        const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
        entries.push({ filename, content });
      } catch (error) {
        logger.warn(`Failed to read memory file ${filename}:`, error);
      }
    }

    return entries;
  }

  /**
   * Synthesize memory entries into a project-level learning summary using LLM
   */
  private async synthesizeLearningSummary(
    projectTitle: string,
    memoryEntries: Array<{ filename: string; content: string }>,
    model: string
  ): Promise<string> {
    // Build memory content for LLM
    const memoryContent = memoryEntries
      .map((entry) => `## Memory File: ${entry.filename}\n\n${entry.content}`)
      .join('\n\n---\n\n');

    const prompt = `You are synthesizing project-level learning from agent memory files created during project implementation.

**Project:** ${projectTitle}

**Task:** Analyze the memory files below and create a concise 1-page learning summary covering:

1. **Key Patterns Discovered**: Reusable architectural patterns, implementation approaches, or technical solutions that worked well
2. **Critical Gotchas**: Important pitfalls, edge cases, or mistakes to avoid in future similar work
3. **Organizational Knowledge**: Cross-cutting insights that apply beyond this specific project
4. **Recommended Practices**: Concrete recommendations for future projects based on what was learned

Focus on insights that will help future projects. Extract patterns, not implementation details. Keep it actionable and concise (1 page max).

**Memory Files:**

${memoryContent}`;

    logger.info(`Synthesizing learning summary for ${projectTitle} using model: ${model}`);

    const result = await simpleQuery({
      prompt,
      model,
      cwd: path.dirname(memoryEntries[0]?.filename || '.'),
      maxTurns: 1,
      allowedTools: [],
    });

    return result.text;
  }

  /**
   * Store learning summary in project directory
   */
  private async storeLearningSummary(
    projectPath: string,
    projectTitle: string,
    summary: string
  ): Promise<void> {
    const summaryPath = path.join(projectPath, 'PROJECT_LEARNINGS.md');

    const formattedSummary = `# Project Learning Summary: ${projectTitle}

**Generated:** ${new Date().toISOString()}

---

${summary}

---

*This summary was automatically generated from agent memory files during project completion.*
*It synthesizes key patterns, gotchas, and organizational knowledge for future reference.*
`;

    await secureFs.writeFile(summaryPath, formattedSummary);
    logger.info(`Stored learning summary at: ${summaryPath}`);
  }

  /**
   * Persist structured learnings to .automaker/memory/ so future agents can learn from them.
   * Parses the LLM-generated summary into sections and writes each as a LearningEntry.
   */
  private async persistToAgentMemory(
    projectPath: string,
    projectTitle: string,
    summary: string
  ): Promise<void> {
    const fsModule: MemoryFsModule = {
      access: (p) => fs.access(p),
      readdir: (p) => fs.readdir(p),
      readFile: (p, enc) => fs.readFile(p, enc),
      writeFile: (p, c) => fs.writeFile(p, c),
      mkdir: (p, opts) => fs.mkdir(p, opts),
      appendFile: (p, c) => fs.appendFile(p, c),
    };

    // Parse the summary into structured learnings by section headings
    const sections: Array<{ heading: string; content: string }> = [];
    const lines = summary.split('\n');
    let currentHeading = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)/);
      if (headingMatch) {
        if (currentHeading && currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
        }
        currentHeading = headingMatch[1].replace(/\*+/g, '').trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    if (currentHeading && currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
    }

    // Map section headings to learning types
    const headingToType: Record<string, LearningEntry['type']> = {
      patterns: 'pattern',
      'key patterns': 'pattern',
      'key patterns discovered': 'pattern',
      gotchas: 'gotcha',
      'critical gotchas': 'gotcha',
      practices: 'pattern',
      'recommended practices': 'pattern',
      knowledge: 'learning',
      'organizational knowledge': 'learning',
      'lessons learned': 'learning',
    };

    const headingToCategory: Record<string, string> = {
      patterns: 'project-patterns',
      'key patterns': 'project-patterns',
      'key patterns discovered': 'project-patterns',
      gotchas: 'gotchas',
      'critical gotchas': 'gotchas',
      practices: 'best-practices',
      'recommended practices': 'best-practices',
      knowledge: 'organizational-knowledge',
      'organizational knowledge': 'organizational-knowledge',
      'lessons learned': 'lessons-learned',
    };

    let persisted = 0;
    for (const section of sections) {
      if (!section.content) continue;

      const lowerHeading = section.heading.toLowerCase();
      const entryType = headingToType[lowerHeading] || 'learning';
      const category = headingToCategory[lowerHeading] || 'project-learnings';

      const learning: LearningEntry = {
        category,
        type: entryType,
        content: section.content,
        context: `From project completion: ${projectTitle}`,
      };

      try {
        await appendLearning(projectPath, learning, fsModule);
        persisted++;
      } catch (error) {
        logger.warn(`Failed to persist learning for "${section.heading}":`, error);
      }
    }

    logger.info(`Persisted ${persisted} learning entries to agent memory for "${projectTitle}"`);
  }

  /**
   * Post a "Project Complete" update to Linear with health='complete'.
   * Best-effort — failures are logged but don't block the ceremony.
   */
  private async postCompletionToLinear(projectPath: string, projectTitle: string): Promise<void> {
    if (!this.settingsService) return;

    try {
      const linearService = new LinearProjectUpdateService(this.settingsService, projectPath);
      if (!(await linearService.isEnabled())) return;

      await linearService.createProjectUpdate({
        projectId: await this.getLinearProjectId(projectPath),
        body: `## Project Complete: ${projectTitle}\n\nAll milestones delivered. Learning summary generated and persisted to agent memory.`,
        health: 'complete',
      });

      logger.info(`Posted completion update to Linear for "${projectTitle}"`);
    } catch (error) {
      logger.error('Failed to post completion to Linear (non-blocking):', error);
    }
  }

  /**
   * Look up the Linear project ID from local project config
   */
  private async getLinearProjectId(projectPath: string): Promise<string> {
    const projectsDir = path.join(projectPath, '.automaker', 'projects');
    try {
      const slugs = await secureFs.readdir(projectsDir);
      for (const slug of slugs) {
        const projectJsonPath = path.join(projectsDir, String(slug), 'project.json');
        try {
          const raw = await secureFs.readFile(projectJsonPath, 'utf-8');
          const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'));
          if (data.linearProjectId) return data.linearProjectId;
        } catch {
          // Skip malformed project files
        }
      }
    } catch {
      // No projects dir
    }
    throw new Error('No Linear project ID found for this project');
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

  /**
   * Extract improvement items from retrospective and create Beads/Automaker items
   * Closes the REFLECT → REPEAT loop
   */
  private async createImprovementItems(
    projectPath: string,
    projectTitle: string,
    retrospective: string,
    dataSummary: string
  ): Promise<void> {
    try {
      logger.info(`Extracting improvement items from retrospective for ${projectTitle}`);

      // Use lightweight query to extract 1-3 actionable improvement tickets
      const extractionPrompt = `Based on this project retrospective, extract 1-3 concrete, actionable improvement items.

For each improvement item, provide:
1. **Title**: Brief, clear title (max 60 chars)
2. **Description**: Detailed description of the improvement (2-4 sentences)
3. **Type**: Either "operational" (process/workflow improvements) or "code" (technical/codebase improvements)
4. **Priority**: 1-3 (1=high, 2=medium, 3=low)
5. **Category**: Optional category tag (e.g., "testing", "ci/cd", "documentation", "architecture")

Focus on improvements that are:
- Specific and actionable (not vague suggestions)
- Based on actual issues encountered in the project
- High-impact and worth implementing

Return the improvements as a JSON array of objects with fields: title, description, type, priority, category.

Retrospective:
${retrospective}

Project Data:
${dataSummary}

Return ONLY the JSON array, no other text.`;

      const result = await simpleQuery({
        prompt: extractionPrompt,
        model: 'haiku', // Use lightweight model for extraction
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      // Parse the JSON response
      let improvements: ImprovementItem[] = [];
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          improvements = JSON.parse(jsonMatch[0]) as ImprovementItem[];
        } else {
          // Try parsing the entire response as JSON
          improvements = JSON.parse(result.text) as ImprovementItem[];
        }
      } catch (parseError) {
        logger.error('Failed to parse improvement items JSON:', parseError);
        logger.debug('Raw LLM response:', result.text);
        return;
      }

      // Validate improvements
      if (!Array.isArray(improvements) || improvements.length === 0) {
        logger.info('No improvement items extracted from retrospective');
        return;
      }

      // Limit to 3 items
      improvements = improvements.slice(0, 3);

      logger.info(`Extracted ${improvements.length} improvement items`);

      const createdBeadsItems: string[] = [];
      const createdFeatureIds: string[] = [];

      // Create Beads items and Automaker features
      for (const improvement of improvements) {
        if (improvement.type === 'operational') {
          // Create Beads task for operational improvements
          const beadsResult = await this.beadsService!.createTask(projectPath, {
            title: improvement.title,
            description: improvement.description,
            priority: improvement.priority,
            issueType: 'task',
            labels: improvement.category
              ? ['retro-improvement', improvement.category]
              : ['retro-improvement'],
          });

          if (beadsResult.success && beadsResult.data) {
            createdBeadsItems.push(beadsResult.data.id);
            logger.info(
              `Created Beads task ${beadsResult.data.id} for operational improvement: ${improvement.title}`
            );
          } else {
            logger.error(
              `Failed to create Beads task for ${improvement.title}:`,
              beadsResult.error
            );
          }
        } else if (improvement.type === 'code') {
          // Create Automaker feature for code improvements
          const feature = await this.featureLoader!.create(projectPath, {
            title: improvement.title,
            description: improvement.description,
            category: improvement.category || 'improvement',
            status: 'backlog',
            priority: improvement.priority as 1 | 2 | 3,
            complexity: 'medium',
          });

          createdFeatureIds.push(feature.id);
          logger.info(
            `Created Automaker feature ${feature.id} for code improvement: ${improvement.title}`
          );
        }
      }

      // Emit event for tracking
      if (this.emitter && (createdBeadsItems.length > 0 || createdFeatureIds.length > 0)) {
        this.emitter.emit('retro:improvements:created', {
          projectPath,
          projectTitle,
          beadsItems: createdBeadsItems,
          featureIds: createdFeatureIds,
          totalImprovements: improvements.length,
        });

        logger.info(
          `Emitted retro:improvements:created event: ${createdBeadsItems.length} Beads items, ${createdFeatureIds.length} features`
        );
      }
    } catch (error) {
      logger.error('Failed to create improvement items:', error);
    }
  }
}

// Singleton instance
export const ceremonyService = new CeremonyService();
