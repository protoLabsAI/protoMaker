/**
 * Changelog Service - Generates human-readable changelogs on milestone/project completion
 *
 * Subscribes to milestone:completed and project:completed events, gathers all merged features
 * with PR titles, descriptions, and categories, generates a human-readable changelog grouped
 * by type (features, fixes, improvements), posts to Discord, and stores as markdown in the
 * project directory (.automaker/projects/{slug}/CHANGELOG.md).
 *
 * This becomes a client deliverable for setupLab engagements.
 */

import path from 'path';
import { createLogger } from '@protolabsai/utils';
import { secureFs } from '@protolabsai/platform';
import { getProjectDir } from '@protolabsai/platform';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import type { ProjectArtifactService } from './project-artifact-service.js';
import type { Feature } from '@protolabsai/types';

const logger = createLogger('ChangelogService');

/**
 * Milestone completion event payload
 */
interface MilestoneEventPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  milestoneTitle: string;
  milestoneNumber: number;
}

/**
 * Project completion event payload
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
 * Grouped changelog entries by category
 */
interface ChangelogGroup {
  features: Feature[];
  fixes: Feature[];
  improvements: Feature[];
  other: Feature[];
}

/**
 * Changelog Service
 *
 * Generates human-readable changelogs on milestone/project completion.
 * - Gathers merged features with PR info
 * - Groups by category (features, fixes, improvements)
 * - Posts to Discord
 * - Stores as markdown in project directory
 */
export class ChangelogService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private projectService: ProjectService | null = null;
  private projectArtifactService: ProjectArtifactService | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the service with dependencies
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    projectService: ProjectService,
    projectArtifactService?: ProjectArtifactService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.projectService = projectService;
    this.projectArtifactService = projectArtifactService ?? null;

    // Subscribe to milestone and project completion events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'milestone:completed') {
        this.handleMilestoneCompleted(payload as MilestoneEventPayload);
      } else if (type === 'project:completed') {
        this.handleProjectCompleted(payload as ProjectCompletedPayload);
      }
    });

    logger.info('Changelog service initialized');
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
    this.projectArtifactService = null;
  }

  /**
   * Handle milestone:completed event
   * Generate and post changelog for the completed milestone
   */
  private async handleMilestoneCompleted(payload: MilestoneEventPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug, milestoneTitle, milestoneNumber } = payload;

    try {
      logger.info(
        `Generating changelog for milestone ${milestoneNumber}: ${milestoneTitle} in project ${projectTitle}`
      );

      // Load the project to get milestone data
      const project = await this.projectService!.getProject(projectPath, projectSlug);
      if (!project) {
        logger.warn(`Project not found: ${projectSlug}`);
        return;
      }

      // Find the milestone by number
      const milestone = project.milestones.find((m) => m.number === milestoneNumber);
      if (!milestone) {
        logger.warn(`Milestone ${milestoneNumber} not found in project ${projectSlug}`);
        return;
      }

      // Gather all features for this milestone that have merged PRs
      const allFeatures = await this.featureLoader!.getAll(projectPath);
      const milestoneFeatures = allFeatures.filter(
        (f) => f.milestoneSlug === milestone.slug && f.status === 'done' && f.prUrl
      );

      if (milestoneFeatures.length === 0) {
        logger.info(`No merged features found for milestone ${milestoneTitle}, skipping changelog`);
        return;
      }

      // Generate the changelog content
      const changelogContent = this.generateChangelogMarkdown(
        projectTitle,
        milestoneTitle,
        milestoneFeatures,
        'milestone'
      );

      // Store changelog in the project directory
      await this.storeChangelog(projectPath, projectSlug, changelogContent, milestone.slug);

      // Persist changelog as a project artifact
      if (this.projectArtifactService) {
        await this.projectArtifactService.saveArtifact(projectPath, projectSlug, 'changelog', {
          scope: 'milestone',
          milestoneTitle,
          milestoneNumber,
          content: changelogContent,
        });
        logger.debug(`Changelog artifact saved for milestone ${milestoneTitle}`);
      }

      // Post to Discord as embed
      await this.postChangelogEmbed(
        projectPath,
        `Milestone ${milestoneNumber} — ${milestoneTitle}`,
        milestoneFeatures
      );

      logger.info(`Changelog generated for milestone ${milestoneTitle}`);
    } catch (error) {
      logger.error('Failed to generate milestone changelog:', error);
    }
  }

  /**
   * Handle project:completed event
   * Generate and post comprehensive changelog for the entire project
   */
  private async handleProjectCompleted(payload: ProjectCompletedPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug } = payload;

    try {
      logger.info(`Generating comprehensive changelog for project ${projectTitle}`);

      // Gather all features across all milestones that have merged PRs
      const allFeatures = await this.featureLoader!.getAll(projectPath);
      const mergedFeatures = allFeatures.filter((f) => f.status === 'done' && f.prUrl);

      if (mergedFeatures.length === 0) {
        logger.info(`No merged features found for project ${projectTitle}, skipping changelog`);
        return;
      }

      // Generate the changelog content
      const changelogContent = this.generateChangelogMarkdown(
        projectTitle,
        'Project Complete',
        mergedFeatures,
        'project'
      );

      // Store changelog in the project directory
      await this.storeChangelog(projectPath, projectSlug, changelogContent);

      // Persist changelog as a project artifact
      if (this.projectArtifactService) {
        await this.projectArtifactService.saveArtifact(projectPath, projectSlug, 'changelog', {
          scope: 'project',
          projectTitle,
          content: changelogContent,
        });
        logger.debug(`Changelog artifact saved for project ${projectTitle}`);
      }

      // Post to Discord as embed
      await this.postChangelogEmbed(projectPath, `${projectTitle} — Complete`, mergedFeatures);

      logger.info(`Comprehensive changelog generated for project ${projectTitle}`);
    } catch (error) {
      logger.error('Failed to generate project changelog:', error);
    }
  }

  /**
   * Group features by category
   * Classifies features into features, fixes, improvements, or other
   */
  private groupFeaturesByCategory(features: Feature[]): ChangelogGroup {
    const groups: ChangelogGroup = {
      features: [],
      fixes: [],
      improvements: [],
      other: [],
    };

    for (const feature of features) {
      const category = feature.category?.toLowerCase() || '';
      const title = feature.title?.toLowerCase() || '';

      // Classify by category or title keywords
      if (
        category.includes('feature') ||
        title.includes('add') ||
        title.includes('implement') ||
        title.includes('create')
      ) {
        groups.features.push(feature);
      } else if (
        category.includes('fix') ||
        category.includes('bug') ||
        title.includes('fix') ||
        title.includes('resolve')
      ) {
        groups.fixes.push(feature);
      } else if (
        category.includes('improvement') ||
        category.includes('enhance') ||
        category.includes('refactor') ||
        category.includes('optimize') ||
        title.includes('improve') ||
        title.includes('enhance') ||
        title.includes('optimize') ||
        title.includes('refactor')
      ) {
        groups.improvements.push(feature);
      } else {
        groups.other.push(feature);
      }
    }

    return groups;
  }

  /**
   * Generate changelog markdown content
   */
  private generateChangelogMarkdown(
    projectTitle: string,
    scope: string,
    features: Feature[],
    _type: 'milestone' | 'project'
  ): string {
    const lines: string[] = [];
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Header
    lines.push(`# Changelog: ${projectTitle} - ${scope}`);
    lines.push(`**Generated:** ${timestamp}`);
    lines.push('');

    // Group features by category
    const groups = this.groupFeaturesByCategory(features);

    // Features section
    if (groups.features.length > 0) {
      lines.push('## ✨ Features');
      lines.push('');
      for (const feature of groups.features) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        const description = feature.description
          ? ` - ${feature.description.split('\n')[0].slice(0, 100)}`
          : '';
        lines.push(`- **${title}** ${prLink}${description}`);
      }
      lines.push('');
    }

    // Fixes section
    if (groups.fixes.length > 0) {
      lines.push('## 🐛 Fixes');
      lines.push('');
      for (const feature of groups.fixes) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        const description = feature.description
          ? ` - ${feature.description.split('\n')[0].slice(0, 100)}`
          : '';
        lines.push(`- **${title}** ${prLink}${description}`);
      }
      lines.push('');
    }

    // Improvements section
    if (groups.improvements.length > 0) {
      lines.push('## 🔧 Improvements');
      lines.push('');
      for (const feature of groups.improvements) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        const description = feature.description
          ? ` - ${feature.description.split('\n')[0].slice(0, 100)}`
          : '';
        lines.push(`- **${title}** ${prLink}${description}`);
      }
      lines.push('');
    }

    // Other changes section
    if (groups.other.length > 0) {
      lines.push('## 📦 Other Changes');
      lines.push('');
      for (const feature of groups.other) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl ? `[PR#${feature.prNumber}](${feature.prUrl})` : 'No PR';
        const description = feature.description
          ? ` - ${feature.description.split('\n')[0].slice(0, 100)}`
          : '';
        lines.push(`- **${title}** ${prLink}${description}`);
      }
      lines.push('');
    }

    // Summary stats
    lines.push('---');
    lines.push('');
    lines.push('## 📊 Summary');
    lines.push('');
    lines.push(`- **Total Changes:** ${features.length}`);
    lines.push(`- **Features:** ${groups.features.length}`);
    lines.push(`- **Fixes:** ${groups.fixes.length}`);
    lines.push(`- **Improvements:** ${groups.improvements.length}`);
    lines.push(`- **Other:** ${groups.other.length}`);

    // Cost summary (if available)
    const totalCost = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);
    if (totalCost > 0) {
      lines.push(`- **Total Cost:** $${totalCost.toFixed(2)}`);
    }

    return lines.join('\n');
  }

  /**
   * Store changelog as markdown in the project directory
   */
  private async storeChangelog(
    projectPath: string,
    projectSlug: string,
    content: string,
    milestoneSlug?: string
  ): Promise<void> {
    const projectDir = getProjectDir(projectPath, projectSlug);

    // Determine filename
    const filename = milestoneSlug ? `CHANGELOG-${milestoneSlug}.md` : 'CHANGELOG.md';
    const changelogPath = path.join(projectDir, filename);

    try {
      // Append to existing changelog or create new one
      let existingContent = '';
      try {
        const rawContent = await secureFs.readFile(changelogPath, 'utf-8');
        if (rawContent != null) {
          existingContent =
            typeof rawContent === 'string' ? rawContent : (rawContent as Buffer).toString('utf-8');
          existingContent += '\n\n---\n\n';
        }
      } catch (error) {
        // File doesn't exist yet, that's fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Write the changelog
      await secureFs.writeFile(changelogPath, existingContent + content);

      logger.info(`Changelog stored at ${changelogPath}`);
    } catch (error) {
      logger.error(`Failed to store changelog at ${changelogPath}:`, error);
      throw error;
    }
  }

  /**
   * Build embed fields from grouped features.
   * Each category becomes an embed field with bullet-pointed feature titles.
   */
  private buildEmbedFields(
    groups: ChangelogGroup
  ): Array<{ name: string; value: string; inline?: boolean }> {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    const addSection = (label: string, features: Feature[]) => {
      if (features.length === 0) return;
      const lines = features.map((f) => {
        const title = f.title || 'Untitled';
        const desc = f.description ? ` — ${f.description.split('\n')[0].slice(0, 80)}` : '';
        return `- ${title}${desc}`;
      });
      // Discord embed field value max is 1024 chars
      const value = lines.join('\n').slice(0, 1024);
      fields.push({ name: label, value });
    };

    addSection('Features', groups.features);
    addSection('Fixes', groups.fixes);
    addSection('Improvements', groups.improvements);
    addSection('Other Changes', groups.other);

    return fields;
  }

  /**
   * Post changelog to Discord as a rich embed
   */
  private async postChangelogEmbed(
    projectPath: string,
    title: string,
    features: Feature[]
  ): Promise<void> {
    if (!this.emitter || !this.settingsService) {
      logger.warn('Cannot post to Discord: emitter or settings service not initialized');
      return;
    }

    try {
      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      const discordConfig = projectSettings.integrations?.discord;

      if (!discordConfig?.enabled) {
        logger.debug('Discord integration not enabled, skipping changelog post');
        return;
      }

      const ceremonySettings = projectSettings.ceremonySettings;
      if (!ceremonySettings?.enabled) {
        logger.debug('Ceremony settings not enabled, skipping changelog post');
        return;
      }

      const groups = this.groupFeaturesByCategory(features);
      const fields = this.buildEmbedFields(groups);

      const totalCost = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);
      const stats = [
        `**${features.length}** changes`,
        groups.features.length ? `${groups.features.length} features` : '',
        groups.fixes.length ? `${groups.fixes.length} fixes` : '',
        groups.improvements.length ? `${groups.improvements.length} improvements` : '',
        totalCost > 0 ? `$${totalCost.toFixed(2)} cost` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      this.emitter.emit('integration:discord', {
        projectPath,
        featureId: 'changelog',
        feature: { id: 'changelog', title } as Feature,
        serverId: discordConfig.serverId,
        channelId:
          discordConfig.channels?.ceremonies ||
          ceremonySettings.discordChannelId ||
          discordConfig.channelId,
        action: 'send_embed',
        embed: {
          title,
          description: stats,
          color: 0x7c3aed, // Purple accent matching the brand
          fields,
          footer: { text: 'protoLabs Studio' },
          timestamp: new Date().toISOString(),
        },
      });

      logger.info(`Changelog embed posted to Discord: ${title}`);
    } catch (error) {
      logger.error('Failed to post changelog embed to Discord:', error);
    }
  }
}

// Singleton instance
export const changelogService = new ChangelogService();
