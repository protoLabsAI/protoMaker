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
   * Get Linear API token from project settings or environment.
   *
   * Priority: apiKey from settings > LINEAR_API_KEY env var
   *
   * @throws {Error} If no token is configured
   */
  private async getAccessToken(): Promise<string> {
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const linearConfig = settings.integrations?.linear;

    // Priority 1: API key from project settings
    if (linearConfig?.apiKey) {
      return linearConfig.apiKey;
    }

    // Priority 2: OAuth agent token (legacy path)
    if (linearConfig?.agentToken) {
      return linearConfig.agentToken;
    }

    // Priority 3: Environment variable
    const envToken = process.env.LINEAR_API_KEY || process.env.LINEAR_API_TOKEN;
    if (envToken) {
      return envToken;
    }

    throw new Error(
      'No Linear API token configured. Set apiKey in project settings or LINEAR_API_KEY env var.'
    );
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

      if (!linearConfig?.enabled || !linearConfig.projectId) return false;
      if (linearConfig.enableProjectUpdates === false) return false;

      // Check for any valid token source
      const hasToken =
        !!linearConfig.apiKey ||
        !!linearConfig.agentToken ||
        !!process.env.LINEAR_API_KEY ||
        !!process.env.LINEAR_API_TOKEN;

      return hasToken;
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
          Authorization: accessToken.startsWith('lin_api_') ? accessToken : `Bearer ${accessToken}`,
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
