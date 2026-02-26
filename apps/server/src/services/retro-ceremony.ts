/**
 * RetroCeremony — milestone retrospective and review content ceremonies
 *
 * Extends StandupCeremony and handles:
 * - Milestone completion retrospectives
 * - Milestone content briefs for GTM
 * - Review completion content briefs (approved / changes requested)
 */

import { simpleQuery } from '../providers/simple-query-service.js';
import { LinearProjectUpdateService } from './linear-project-update-service.js';
import { StandupCeremony } from './standup-ceremony.js';
import { logger, type MilestoneEventPayload } from './ceremony-base.js';
import type { Feature, CeremonySettings } from '@protolabs-ai/types';
import crypto from 'crypto';

export class RetroCeremony extends StandupCeremony {
  /**
   * Handle milestone:completed event
   */
  protected override async handleMilestoneCompleted(payload: MilestoneEventPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug, milestoneTitle, milestoneNumber } = payload;

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableMilestoneUpdates) {
      logger.debug('Ceremonies disabled, skipping milestone update');
      return;
    }

    try {
      const content = await this.generateMilestoneCeremony(
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
          `Milestone ${milestoneNumber}: ${milestoneTitle}`,
          correlationId
        );
        if (success) anySuccess = true;
      }

      this.recordCeremony('milestone_retro', projectPath, anySuccess, {
        id: correlationId,
        projectSlug,
        channelId: ceremonySettings.discordChannelId,
        title: `Milestone ${milestoneNumber}: ${milestoneTitle}`,
      });

      const project = await this.projectService!.getProject(projectPath, projectSlug);
      const milestone = project?.milestones.find((m) => m.number === milestoneNumber);
      let hasBlockers = false;

      if (milestone) {
        const milestoneFeatures = await this.getMilestoneFeatures(projectPath, milestone.slug);
        hasBlockers = milestoneFeatures.some((f) => f.error || f.status === 'blocked');

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

      if (anySuccess) {
        this.ceremonyCounts.milestoneRetro++;
        this.lastCeremonyAt = new Date().toISOString();
        logger.info(
          `Posted milestone ceremony for ${projectTitle} - Milestone ${milestoneNumber}: ${milestoneTitle}`
        );
      } else {
        this.ceremonyCounts.discordPostFailures++;
      }
    } catch (error) {
      logger.error('Failed to generate milestone ceremony:', error);
    }
  }

  /**
   * Handle review completed events — generate content brief for GTM
   */
  protected override async handleReviewCompleted(
    payload: { projectPath: string; featureId: string; reviewNotes?: string },
    verdict: 'approved' | 'changes_requested'
  ): Promise<void> {
    const { projectPath, featureId, reviewNotes } = payload;

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled) {
      logger.debug('Ceremonies disabled, skipping content brief generation');
      return;
    }

    try {
      const feature = await this.featureLoader!.get(projectPath, featureId);
      if (!feature) {
        logger.warn(`Feature ${featureId} not found for content brief`);
        return;
      }

      const contentBrief = await this.generateContentBrief(
        projectPath,
        feature,
        verdict,
        reviewNotes
      );

      const messages = this.splitMessage(contentBrief, 2000);
      let anySuccess = false;
      for (const message of messages) {
        const success = await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Content Brief: ${feature.title}`
        );
        if (success) anySuccess = true;
      }

      if (anySuccess) {
        logger.info(`Posted content brief for feature "${feature.title}"`);
      } else {
        this.ceremonyCounts.discordPostFailures++;
      }
    } catch (error) {
      logger.error('Failed to generate content brief:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Content generators and helpers
  // ---------------------------------------------------------------------------

  /**
   * Get all features for a milestone
   */
  protected async getMilestoneFeatures(
    projectPath: string,
    milestoneSlug: string
  ): Promise<Feature[]> {
    const allFeatures = await this.featureLoader!.getAll(projectPath);
    return allFeatures.filter((f) => f.milestoneSlug === milestoneSlug);
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
    const project = await this.projectService!.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project not found: ${projectSlug}`);
    }

    const milestone = project.milestones.find((m) => m.number === milestoneNumber);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneNumber} not found in project ${projectSlug}`);
    }

    const features = await this.getMilestoneFeatures(projectPath, milestone.slug);
    const totalCost = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);
    const featureCount = features.length;
    const totalMilestones = project.milestones.length;
    const blockedFeatures = features.filter((f) => f.error || f.status === 'blocked');
    const nextMilestone = project.milestones.find((m) => m.number === milestoneNumber + 1);

    const lines: string[] = [];

    lines.push(`🏁 **${projectTitle}** — Milestone ${milestoneNumber}/${totalMilestones} Complete`);
    lines.push(`### ${milestoneTitle}\n`);

    lines.push(`**Features Shipped:** ${featureCount}`);
    if (features.length > 0) {
      for (const feature of features) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        lines.push(`- ${title} — ${prLink}`);
      }
      lines.push('');
    }

    if (totalCost > 0) {
      lines.push(`**Total Cost:** $${totalCost.toFixed(2)}`);
      const avgCost = totalCost / featureCount;
      lines.push(`**Avg per Feature:** $${avgCost.toFixed(2)}`);
      lines.push('');
    }

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

    if (blockedFeatures.length > 0) {
      lines.push(`**Blockers Encountered:** ${blockedFeatures.length}`);
      for (const feature of blockedFeatures) {
        const title = feature.title || 'Untitled';
        const error = feature.error ? ` — ${feature.error.slice(0, 100)}` : '';
        lines.push(`- ${title}${error}`);
      }
      lines.push('');
    }

    if (nextMilestone) {
      lines.push(`**What's Next:** Milestone ${nextMilestone.number} — ${nextMilestone.title}`);
      lines.push(`${nextMilestone.phases.length} phases planned`);
    } else {
      lines.push(`**Project Status:** All milestones complete! 🎉`);
    }

    return lines.join('\n');
  }

  /**
   * Generate and post a content brief to the GTM channel when a milestone completes.
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

    const channelId = ceremonySettings.contentBriefChannelId || ceremonySettings.discordChannelId;
    if (!channelId) {
      logger.debug(
        'No contentBriefChannelId or discordChannelId configured, skipping content brief'
      );
      return;
    }

    try {
      const shipped = features.filter((f) => f.status === 'done' && f.prUrl);
      const totalCost = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);

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

      const messages = this.splitMessage(formatted, 2000);
      const correlationId = crypto.randomUUID();
      let anySuccess = false;
      for (const message of messages) {
        const success = await this.emitDiscordEvent(
          projectPath,
          channelId,
          message,
          `Content Brief: ${milestoneTitle}`,
          correlationId
        );
        if (success) anySuccess = true;
      }

      this.recordCeremony('content_brief', projectPath, anySuccess, {
        id: correlationId,
        projectSlug,
        channelId,
        title: `Content Brief: ${milestoneTitle}`,
      });

      if (anySuccess) {
        this.ceremonyCounts.contentBrief++;
        this.lastCeremonyAt = new Date().toISOString();
        logger.info(`Posted content brief to GTM channel for milestone: ${milestoneTitle}`);
      } else {
        this.ceremonyCounts.discordPostFailures++;
      }
    } catch (error) {
      logger.error('Failed to generate milestone content brief:', error);
    }
  }

  /**
   * Generate content brief (blog outline) from review process
   */
  private async generateContentBrief(
    projectPath: string,
    feature: Feature,
    verdict: 'approved' | 'changes_requested',
    reviewNotes?: string
  ): Promise<string> {
    const model = 'sonnet';

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
    const verdictEmoji = verdict === 'approved' ? '✅' : '⚠️';
    return `${verdictEmoji} **Content Brief Generated**: ${feature.title}\n\n${outline}`;
  }
}
