/**
 * StandupCeremony — epic kickoff, milestone standup, and epic delivery ceremonies
 *
 * Extends CeremonyBase and handles:
 * - Epic kickoff announcements (epic created)
 * - Milestone standup posts (milestone started)
 * - Epic delivery announcements (epic feature completed)
 */

import { LinearProjectUpdateService } from './linear-project-update-service.js';
import {
  CeremonyBase,
  logger,
  type EpicCreatedEventPayload,
  type MilestoneEventPayload,
  type EpicCompletedPayload,
} from './ceremony-base.js';
import type { Feature } from '@protolabs-ai/types';
import crypto from 'crypto';

export class StandupCeremony extends CeremonyBase {
  /**
   * Handle epic creation event — post kickoff announcement with scope and complexity
   */
  protected override async handleEpicCreated(payload: EpicCreatedEventPayload): Promise<void> {
    const { projectPath, projectSlug, milestoneSlug } = payload;

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableEpicKickoff) {
      logger.debug('Epic kickoffs disabled, skipping epic kickoff');
      return;
    }

    try {
      const project = await this.projectService!.getProject(projectPath, projectSlug);
      if (!project) {
        logger.warn(`Project not found: ${projectSlug}`);
        return;
      }

      const milestone = project.milestones.find((m) => m.slug === milestoneSlug);
      if (!milestone) {
        logger.warn(`Milestone not found for epic: ${milestoneSlug}`);
        return;
      }

      const content = this.generateEpicKickoff(project.title, milestone);
      const messages = this.splitMessage(content, 2000);

      const correlationId = crypto.randomUUID();
      let anySuccess = false;
      for (const message of messages) {
        const success = await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Epic Kickoff: ${milestone.title}`,
          correlationId
        );
        if (success) anySuccess = true;
      }

      this.recordCeremony('epic_kickoff', projectPath, anySuccess, {
        id: correlationId,
        projectSlug,
        milestoneSlug,
        channelId: ceremonySettings.discordChannelId,
        title: `Epic Kickoff: ${milestone.title}`,
      });

      if (anySuccess) {
        this.ceremonyCounts.epicKickoff++;
        this.lastCeremonyAt = new Date().toISOString();
        logger.info(`Posted epic kickoff for ${project.title} - Epic: ${milestone.title}`);
      } else {
        this.ceremonyCounts.discordPostFailures++;
      }
    } catch (error) {
      logger.error('Failed to generate epic kickoff:', error);
    }
  }

  /**
   * Handle milestone:started event — post standup with planned scope
   */
  protected override async handleMilestoneStarted(payload: MilestoneEventPayload): Promise<void> {
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

      const correlationId = crypto.randomUUID();
      let anySuccess = false;
      for (const message of messages) {
        const success = await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Standup: Milestone ${milestoneNumber} — ${milestoneTitle}`,
          correlationId
        );
        if (success) anySuccess = true;
      }

      this.recordCeremony('standup', projectPath, anySuccess, {
        id: correlationId,
        projectSlug,
        channelId: ceremonySettings.discordChannelId,
        title: `Standup: Milestone ${milestoneNumber} — ${milestoneTitle}`,
      });

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

      if (anySuccess) {
        this.ceremonyCounts.standup++;
        this.lastCeremonyAt = new Date().toISOString();
        logger.info(
          `Posted milestone standup for ${projectTitle} - Milestone ${milestoneNumber}: ${milestoneTitle}`
        );
      } else {
        this.ceremonyCounts.discordPostFailures++;
      }
    } catch (error) {
      logger.error('Failed to generate milestone standup:', error);
    }
  }

  /**
   * Handle feature:completed event for epics — post delivery announcement
   */
  protected override async handleEpicCompleted(payload: EpicCompletedPayload): Promise<void> {
    const { projectPath, featureId, featureTitle } = payload;

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableEpicDelivery) {
      logger.debug('Epic delivery ceremonies disabled, skipping announcement');
      return;
    }

    try {
      const epic = await this.featureLoader!.get(projectPath, featureId);
      if (!epic) {
        logger.warn(`Epic ${featureId} not found for announcement`);
        return;
      }

      const content = await this.generateEpicDeliveryAnnouncement(projectPath, epic);
      const messages = this.splitMessage(content, 2000);

      const correlationId = crypto.randomUUID();
      let anySuccess = false;
      for (const message of messages) {
        const success = await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Epic Delivered: ${featureTitle}`,
          correlationId
        );
        if (success) anySuccess = true;
      }

      this.recordCeremony('epic_delivery', projectPath, anySuccess, {
        id: correlationId,
        featureId,
        channelId: ceremonySettings.discordChannelId,
        title: `Epic Delivered: ${featureTitle}`,
      });

      if (anySuccess) {
        this.ceremonyCounts.epicDelivery++;
        this.lastCeremonyAt = new Date().toISOString();
        logger.info(`Posted epic delivery announcement for "${featureTitle}"`);
      } else {
        this.ceremonyCounts.discordPostFailures++;
      }
    } catch (error) {
      logger.error('Failed to generate epic delivery announcement:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Content generators
  // ---------------------------------------------------------------------------

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

    lines.push(`🎯 **${projectTitle}** — Epic Kickoff`);
    lines.push(`### ${milestone.title}\n`);

    if (milestone.description) {
      lines.push(`**Overview:** ${milestone.description}\n`);
    }

    lines.push(`**Planned Phases:** ${milestone.phases.length}`);
    if (milestone.phases.length > 0) {
      for (const phase of milestone.phases) {
        const complexity = phase.complexity ? ` [${phase.complexity}]` : '';
        lines.push(`- ${phase.title}${complexity}`);
      }
      lines.push('');
    }

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

    lines.push(`🚀 **${projectTitle}** — Milestone ${milestoneNumber}/${totalMilestones} Starting`);
    lines.push(`### Standup: ${milestoneTitle}\n`);

    lines.push(`**Planned Phases:** ${milestone.phases.length}`);
    if (milestone.phases.length > 0) {
      for (const phase of milestone.phases) {
        const complexity = phase.complexity ? ` [${phase.complexity}]` : '';
        lines.push(`- ${phase.title}${complexity}`);
      }
      lines.push('');
    }

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

    const completedMilestones = project.milestones.filter((m) => m.status === 'completed').length;
    if (completedMilestones > 0) {
      lines.push(`**Progress:** ${completedMilestones}/${totalMilestones} milestones done`);
    }

    if (milestone.description) {
      lines.push('');
      lines.push(`**Goal:** ${milestone.description}`);
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
    const allFeatures = await this.featureLoader!.getAll(projectPath);
    const childFeatures = allFeatures.filter((f) => f.epicId === epic.id && f.id !== epic.id);

    const totalCost = childFeatures.reduce((sum, f) => sum + (f.costUsd || 0), 0);
    const featureCount = childFeatures.length;

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

    const lines: string[] = [];

    lines.push(`🎁 **${epic.title}** — Epic Delivered!`);
    lines.push('');

    lines.push(`**Features Shipped:** ${featureCount}`);
    if (childFeatures.length > 0) {
      for (const feature of childFeatures) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        lines.push(`- ${title} — ${prLink}`);
      }
      lines.push('');
    }

    if (totalCost > 0) {
      lines.push(`**Total Cost:** $${totalCost.toFixed(2)}`);
      const avgCost = featureCount > 0 ? totalCost / featureCount : 0;
      lines.push(`**Avg per Feature:** $${avgCost.toFixed(2)}`);
      lines.push('');
    }

    if (duration) {
      lines.push(`**Duration:** ${duration}`);
      lines.push('');
    }

    if (childFeatures.length > 0) {
      const shippedCount = childFeatures.filter((f) => f.status === 'done' && f.prUrl).length;
      lines.push(`**Shipped:** ${shippedCount}/${featureCount} features with PRs`);
    }

    return lines.join('\n');
  }
}
