/**
<<<<<<< HEAD
 * LinearProjectUpdateService - Generates and posts status updates to Linear projects
 *
 * Collects board state (features done/total, PR status, blockers) and posts
 * structured status updates to Linear via projectUpdateCreate mutation.
 *
 * Usage:
 *   const service = new LinearProjectUpdateService(linearMCPClient, featureLoader);
 *   await service.postStatusUpdate(projectPath, linearProjectId, milestoneTitle);
 */

import { createLogger } from '@automaker/utils';
import type { LinearMCPClient } from './linear-mcp-client.js';
import type { FeatureLoader } from './feature-loader.js';
import type { Feature } from '@automaker/types';
=======
 * Linear Project Update Service
 *
 * Creates status updates for Linear projects based on ceremony events.
 * Integrates with CeremonyService to post daily standups and milestone
 * completion summaries to Linear project updates.
 */

import { createLogger } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';
>>>>>>> 03ec734c (feat(ceremonies): integrate LinearProjectUpdateService with CeremonyService)

const logger = createLogger('LinearProjectUpdateService');

/**
<<<<<<< HEAD
 * Status update content structure
 */
export interface StatusUpdateContent {
  /** Features completed in current milestone */
  completedCount: number;
  /** Total features in current milestone */
  totalCount: number;
  /** Features currently in progress */
  inProgressCount: number;
  /** Features in review */
  reviewCount: number;
  /** Features blocked */
  blockedCount: number;
  /** List of blocked features with reasons */
  blockers: Array<{ featureId: string; title: string; reason?: string }>;
  /** List of PRs awaiting review */
  pendingPRs: Array<{ featureId: string; title: string; prUrl?: string }>;
  /** Milestone title */
  milestoneTitle?: string;
  /** Completion percentage */
  completionPercentage: number;
}

/**
 * LinearProjectUpdateService - Generate and post status updates to Linear
 */
export class LinearProjectUpdateService {
  constructor(
    private linearMCPClient: LinearMCPClient,
    private featureLoader: FeatureLoader
  ) {}

  /**
   * Collect board state for a milestone
   *
   * @param projectPath - Path to the project
   * @param milestoneTitle - Optional milestone to filter by
   * @returns Status update content
   */
  async collectBoardState(
    projectPath: string,
    milestoneTitle?: string
  ): Promise<StatusUpdateContent> {
    const features = await this.featureLoader.getAll(projectPath);

    // Filter by milestone if provided
    const milestoneFeatures = milestoneTitle
      ? features.filter((f) => f.milestone === milestoneTitle)
      : features;

    // Count by status
    const completedCount = milestoneFeatures.filter((f) => f.status === 'done').length;
    const inProgressCount = milestoneFeatures.filter((f) => f.status === 'in_progress').length;
    const reviewCount = milestoneFeatures.filter((f) => f.status === 'review').length;
    const blockedCount = milestoneFeatures.filter((f) => f.status === 'blocked').length;
    const totalCount = milestoneFeatures.length;

    // Collect blockers
    const blockers = milestoneFeatures
      .filter((f) => f.status === 'blocked')
      .map((f) => ({
        featureId: f.id,
        title: f.title || f.id,
        reason: f.error,
      }));

    // Collect pending PRs (features in review status)
    const pendingPRs = milestoneFeatures
      .filter((f) => f.status === 'review')
      .map((f) => ({
        featureId: f.id,
        title: f.title || f.id,
        prUrl: f.prUrl,
      }));

    // Calculate completion percentage
    const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return {
      completedCount,
      totalCount,
      inProgressCount,
      reviewCount,
      blockedCount,
      blockers,
      pendingPRs,
      milestoneTitle,
      completionPercentage,
    };
  }

  /**
   * Format status update content as markdown
   *
   * @param content - Status update content
   * @returns Formatted markdown string
   */
  private formatStatusUpdate(content: StatusUpdateContent): string {
    const lines: string[] = [];

    // Header with milestone and completion
    if (content.milestoneTitle) {
      lines.push(`## ${content.milestoneTitle}`);
    } else {
      lines.push(`## Project Status Update`);
    }
    lines.push('');

    // Progress summary
    lines.push(
      `**Progress:** ${content.completedCount}/${content.totalCount} features completed (${content.completionPercentage}%)`
    );
    lines.push('');

    // Status breakdown
    lines.push('### Status Breakdown');
    lines.push(`- ✅ Done: ${content.completedCount}`);
    lines.push(`- 🔄 In Progress: ${content.inProgressCount}`);
    lines.push(`- 👀 In Review: ${content.reviewCount}`);
    lines.push(`- ⛔ Blocked: ${content.blockedCount}`);
    lines.push('');

    // Blockers section
    if (content.blockers.length > 0) {
      lines.push('### ⚠️ Blockers');
      for (const blocker of content.blockers) {
        lines.push(`- **${blocker.title}** (${blocker.featureId})`);
        if (blocker.reason) {
          lines.push(`  - ${blocker.reason}`);
        }
      }
      lines.push('');
    }

    // Pending PRs section
    if (content.pendingPRs.length > 0) {
      lines.push('### 📋 PRs Awaiting Review');
      for (const pr of content.pendingPRs) {
        if (pr.prUrl) {
          lines.push(`- [${pr.title}](${pr.prUrl})`);
        } else {
          lines.push(`- ${pr.title}`);
        }
      }
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push(`_Generated on ${new Date().toLocaleString()}_`);

    return lines.join('\n');
  }

  /**
   * Post a status update to a Linear project
   *
   * @param projectPath - Path to the project
   * @param linearProjectId - Linear project ID
   * @param milestoneTitle - Optional milestone to filter by
   * @returns True if update was posted successfully
   */
  async postStatusUpdate(
    projectPath: string,
    linearProjectId: string,
    milestoneTitle?: string
  ): Promise<boolean> {
    logger.info(
      `Generating status update for project ${linearProjectId}${milestoneTitle ? ` (milestone: ${milestoneTitle})` : ''}`
    );

    // Collect board state
    const content = await this.collectBoardState(projectPath, milestoneTitle);

    // Format as markdown
    const body = this.formatStatusUpdate(content);

    // Post to Linear
    const mutation = `
      mutation CreateProjectUpdate(
        $projectId: String!
        $body: String!
        $health: ProjectUpdateHealthType
      ) {
        projectUpdateCreate(
          input: {
            projectId: $projectId
            body: $body
            health: $health
          }
        ) {
=======
 * Linear API endpoint
 */
const LINEAR_API_ENDPOINT = 'https://api.linear.app/graphql';

/**
 * Options for creating a project update
 */
export interface CreateProjectUpdateOptions {
  /** Project ID to create update for */
  projectId: string;
  /** Update body (markdown) */
  body: string;
  /** Health status (onTrack, atRisk, offTrack, complete) */
  health?: 'onTrack' | 'atRisk' | 'offTrack' | 'complete';
}

/**
 * Result of creating a project update
 */
export interface CreateProjectUpdateResult {
  /** Created update ID */
  updateId: string;
  /** Update URL */
  url?: string;
}

/**
 * LinearProjectUpdateService
 *
 * Creates Linear project updates for ceremony events like daily standups
 * and milestone completions. Provides health status tracking for projects.
 */
export class LinearProjectUpdateService {
  constructor(
    private settingsService: SettingsService,
    private projectPath: string
  ) {}

  /**
   * Get OAuth access token from project settings
   *
   * @throws {Error} If no token is configured
   */
  private async getAccessToken(): Promise<string> {
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;

    if (!linearAccessToken) {
      throw new Error('No Linear OAuth token found in project settings');
    }

    return linearAccessToken;
  }

  /**
   * Get Linear project ID from project settings
   *
   * @throws {Error} If no project ID is configured
   */
  private async getProjectId(): Promise<string> {
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const projectId = settings.integrations?.linear?.projectId;

    if (!projectId) {
      throw new Error('No Linear project ID found in project settings');
    }

    return projectId;
  }

  /**
   * Check if Linear project updates are enabled
   */
  async isEnabled(): Promise<boolean> {
    try {
      const settings = await this.settingsService.getProjectSettings(this.projectPath);
      const linearConfig = settings.integrations?.linear;

      return !!(
        linearConfig?.enabled &&
        linearConfig.agentToken &&
        linearConfig.projectId &&
        linearConfig.enableProjectUpdates !== false
      );
    } catch (error) {
      logger.error('Failed to check Linear project update settings:', error);
      return false;
    }
  }

  /**
   * Create a project update
   *
   * @param options - Update creation options
   * @returns Result with update ID and URL
   * @throws {Error} On API errors or configuration issues
   */
  async createProjectUpdate(
    options: CreateProjectUpdateOptions
  ): Promise<CreateProjectUpdateResult> {
    const accessToken = await this.getAccessToken();

    // GraphQL mutation to create project update
    const mutation = `
      mutation CreateProjectUpdate($projectId: String!, $body: String!, $health: ProjectUpdateHealthType) {
        projectUpdateCreate(input: { projectId: $projectId, body: $body, health: $health }) {
>>>>>>> 03ec734c (feat(ceremonies): integrate LinearProjectUpdateService with CeremonyService)
          success
          projectUpdate {
            id
            url
          }
        }
      }
    `;

<<<<<<< HEAD
    // Determine health status based on blockers
    let health: 'onTrack' | 'atRisk' | 'offTrack' = 'onTrack';
    if (content.blockedCount > 0) {
      health = 'offTrack';
    } else if (content.completionPercentage < 50 && content.inProgressCount === 0) {
      health = 'atRisk';
    }

    const variables = {
      projectId: linearProjectId,
      body,
      health,
    };

    interface CreateProjectUpdateResponse {
      projectUpdateCreate: {
        success: boolean;
        projectUpdate: {
          id: string;
          url: string;
        };
      };
    }

    const data = await this.linearMCPClient.executeGraphQL<CreateProjectUpdateResponse>(
      mutation,
      variables
    );

    if (!data.projectUpdateCreate.success) {
      logger.error('Failed to create Linear project update');
      return false;
    }

    logger.info(`Posted status update to Linear: ${data.projectUpdateCreate.projectUpdate.url}`);

    return true;
=======
    const variables = {
      projectId: options.projectId,
      body: options.body,
      health: options.health || 'onTrack',
    };

    // Create AbortController with 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(LINEAR_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: {
          projectUpdateCreate?: {
            success: boolean;
            projectUpdate?: { id: string; url: string };
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      if (!result.data?.projectUpdateCreate?.success || !result.data.projectUpdateCreate.projectUpdate) {
        throw new Error('Failed to create Linear project update');
      }

      logger.info(`Created Linear project update: ${result.data.projectUpdateCreate.projectUpdate.id}`);

      return {
        updateId: result.data.projectUpdateCreate.projectUpdate.id,
        url: result.data.projectUpdateCreate.projectUpdate.url,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  /**
   * Create a daily standup update
   *
   * @param standupContent - Standup markdown content
   * @returns Result with update ID and URL
   */
  async createDailyStandup(standupContent: string): Promise<CreateProjectUpdateResult> {
    const projectId = await this.getProjectId();

    return this.createProjectUpdate({
      projectId,
      body: standupContent,
      health: 'onTrack',
    });
  }

  /**
   * Create a milestone completion update
   *
   * @param milestoneContent - Milestone completion markdown content
   * @param hasBlockers - Whether blockers were encountered
   * @returns Result with update ID and URL
   */
  async createMilestoneCompletion(
    milestoneContent: string,
    hasBlockers = false
  ): Promise<CreateProjectUpdateResult> {
    const projectId = await this.getProjectId();

    return this.createProjectUpdate({
      projectId,
      body: milestoneContent,
      health: hasBlockers ? 'atRisk' : 'onTrack',
    });
>>>>>>> 03ec734c (feat(ceremonies): integrate LinearProjectUpdateService with CeremonyService)
  }
}
