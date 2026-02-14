/**
 * Linear Project Update Service
 *
 * Creates status updates for Linear projects based on ceremony events.
 * Integrates with CeremonyService to post daily standups and milestone
 * completion summaries to Linear project updates.
 */

import { createLogger } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('LinearProjectUpdateService');

/**
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
          success
          projectUpdate {
            id
            url
          }
        }
      }
    `;

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

      if (
        !result.data?.projectUpdateCreate?.success ||
        !result.data.projectUpdateCreate.projectUpdate
      ) {
        throw new Error('Failed to create Linear project update');
      }

      logger.info(
        `Created Linear project update: ${result.data.projectUpdateCreate.projectUpdate.id}`
      );

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
  }
}
