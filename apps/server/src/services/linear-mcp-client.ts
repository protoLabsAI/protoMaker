/**
 * LinearMCPClient - Wrapper for Linear GraphQL API with OAuth token management
 *
 * Provides typed methods for creating issues, updating issue status/priority,
 * and adding comments to Linear issues. Handles OAuth token retrieval from
 * project settings and provides error handling for token expiry, rate limits,
 * and network failures.
 *
 * Usage:
 *   const client = new LinearMCPClient(settingsService, projectPath);
 *   const issueId = await client.createIssue({
 *     title: 'New Feature',
 *     description: 'Feature description',
 *     teamId: 'team-id'
 *   });
 */

import { createLogger } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('LinearMCPClient');

/**
 * Linear API endpoint
 */
const LINEAR_API_ENDPOINT = 'https://api.linear.app/graphql';

/**
 * Error types for Linear API failures
 */
export class LinearAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isTokenExpired: boolean = false,
    public readonly isRateLimited: boolean = false
  ) {
    super(message);
    this.name = 'LinearAPIError';
  }
}

/**
 * Options for creating a Linear issue
 */
export interface CreateIssueOptions {
  /** Issue title */
  title: string;
  /** Issue description (markdown) */
  description?: string;
  /** Team ID to create issue in */
  teamId: string;
  /** Project ID to associate issue with (optional) */
  projectId?: string;
  /** Priority level (0=none, 1=urgent, 2=high, 3=normal, 4=low) */
  priority?: number;
  /** Label IDs to apply to the issue */
  labelIds?: string[];
  /** Assignee ID */
  assigneeId?: string;
}

/**
 * Options for updating a Linear issue
 */
export interface UpdateIssueOptions {
  /** Issue ID to update */
  issueId: string;
  /** New title (optional) */
  title?: string;
  /** New description (optional) */
  description?: string;
  /** New state ID (optional) */
  stateId?: string;
  /** New priority (optional) */
  priority?: number;
  /** New assignee ID (optional) */
  assigneeId?: string;
}

/**
 * Options for adding a comment to a Linear issue
 */
export interface AddCommentOptions {
  /** Issue ID to add comment to */
  issueId: string;
  /** Comment body (markdown) */
  body: string;
}

/**
 * Result of creating a Linear issue
 */
export interface CreateIssueResult {
  /** Created issue ID */
  issueId: string;
  /** Created issue identifier (e.g., "ENG-123") */
  identifier?: string;
  /** Issue URL */
  url?: string;
}

/**
 * LinearMCPClient - Client for interacting with Linear GraphQL API
 *
 * Wraps Linear GraphQL API calls with OAuth token management from project settings.
 * Provides typed methods for common operations like creating issues, updating status,
 * and adding comments.
 */
export class LinearMCPClient {
  constructor(
    private settingsService: SettingsService,
    private projectPath: string
  ) {}

  /**
   * Get OAuth access token from project settings
   *
   * @throws {LinearAPIError} If no token is configured
   */
  private async getAccessToken(): Promise<string> {
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;

    if (!linearAccessToken) {
      throw new LinearAPIError('No Linear OAuth token found in project settings', undefined, true);
    }

    return linearAccessToken;
  }

  /**
   * Execute a GraphQL query against Linear API
   *
   * @param query - GraphQL query or mutation
   * @param variables - Query variables
   * @returns GraphQL response data
   * @throws {LinearAPIError} On API errors, token expiry, or rate limiting
   */
  private async executeGraphQL<T = unknown>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const accessToken = await this.getAccessToken();

    try {
      const response = await fetch(LINEAR_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query, variables }),
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new LinearAPIError(
          `Linear API rate limit exceeded. Retry after: ${retryAfter || 'unknown'}`,
          429,
          false,
          true
        );
      }

      // Handle authentication errors (token expired or invalid)
      if (response.status === 401 || response.status === 403) {
        throw new LinearAPIError(
          `Linear API authentication failed: ${response.status} ${response.statusText}`,
          response.status,
          true,
          false
        );
      }

      // Handle other HTTP errors
      if (!response.ok) {
        throw new LinearAPIError(
          `Linear API error: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      const result = (await response.json()) as {
        data?: T;
        errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
      };

      // Handle GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map((e) => e.message).join(', ');
        // Check if error indicates authentication issue
        const isAuthError = result.errors.some(
          (e) =>
            e.message.toLowerCase().includes('unauthorized') ||
            e.message.toLowerCase().includes('authentication') ||
            e.extensions?.code === 'UNAUTHENTICATED'
        );
        throw new LinearAPIError(`Linear GraphQL error: ${errorMessages}`, undefined, isAuthError);
      }

      if (!result.data) {
        throw new LinearAPIError('Linear API returned no data');
      }

      return result.data;
    } catch (error) {
      // Re-throw LinearAPIError as-is
      if (error instanceof LinearAPIError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new LinearAPIError(`Network error connecting to Linear API: ${error.message}`);
      }

      // Wrap other errors
      throw new LinearAPIError(
        `Unexpected error calling Linear API: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a new Linear issue
   *
   * @param options - Issue creation options
   * @returns Created issue ID and metadata
   * @throws {LinearAPIError} On API errors
   */
  async createIssue(options: CreateIssueOptions): Promise<CreateIssueResult> {
    const { title, description, teamId, projectId, priority, labelIds, assigneeId } = options;

    const mutation = `
      mutation CreateIssue(
        $title: String!
        $description: String
        $teamId: String!
        $projectId: String
        $priority: Int
        $labelIds: [String!]
        $assigneeId: String
      ) {
        issueCreate(
          input: {
            title: $title
            description: $description
            teamId: $teamId
            projectId: $projectId
            priority: $priority
            labelIds: $labelIds
            assigneeId: $assigneeId
          }
        ) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `;

    const variables = {
      title,
      description,
      teamId,
      projectId,
      priority,
      labelIds,
      assigneeId,
    };

    interface CreateIssueResponse {
      issueCreate: {
        success: boolean;
        issue: {
          id: string;
          identifier: string;
          url: string;
        };
      };
    }

    const data = await this.executeGraphQL<CreateIssueResponse>(mutation, variables);

    if (!data.issueCreate.success) {
      throw new LinearAPIError('Failed to create Linear issue');
    }

    logger.info(`Created Linear issue: ${data.issueCreate.issue.identifier}`);

    return {
      issueId: data.issueCreate.issue.id,
      identifier: data.issueCreate.issue.identifier,
      url: data.issueCreate.issue.url,
    };
  }

  /**
   * Update an existing Linear issue
   *
   * @param options - Issue update options
   * @returns True if update succeeded
   * @throws {LinearAPIError} On API errors
   */
  async updateIssue(options: UpdateIssueOptions): Promise<boolean> {
    const { issueId, title, description, stateId, priority, assigneeId } = options;

    const mutation = `
      mutation UpdateIssue(
        $issueId: String!
        $title: String
        $description: String
        $stateId: String
        $priority: Int
        $assigneeId: String
      ) {
        issueUpdate(
          id: $issueId
          input: {
            title: $title
            description: $description
            stateId: $stateId
            priority: $priority
            assigneeId: $assigneeId
          }
        ) {
          success
          issue {
            id
            identifier
          }
        }
      }
    `;

    const variables = {
      issueId,
      title,
      description,
      stateId,
      priority,
      assigneeId,
    };

    interface UpdateIssueResponse {
      issueUpdate: {
        success: boolean;
        issue: {
          id: string;
          identifier: string;
        };
      };
    }

    const data = await this.executeGraphQL<UpdateIssueResponse>(mutation, variables);

    if (!data.issueUpdate.success) {
      throw new LinearAPIError('Failed to update Linear issue');
    }

    logger.info(`Updated Linear issue: ${data.issueUpdate.issue.identifier}`);

    return true;
  }

  /**
   * Add a comment to a Linear issue
   *
   * @param options - Comment options
   * @returns True if comment was added successfully
   * @throws {LinearAPIError} On API errors
   */
  async addComment(options: AddCommentOptions): Promise<boolean> {
    const { issueId, body } = options;

    const mutation = `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
            body
          }
        }
      }
    `;

    const variables = {
      issueId,
      body,
    };

    interface CreateCommentResponse {
      commentCreate: {
        success: boolean;
        comment: {
          id: string;
          body: string;
        };
      };
    }

    const data = await this.executeGraphQL<CreateCommentResponse>(mutation, variables);

    if (!data.commentCreate.success) {
      throw new LinearAPIError('Failed to create Linear comment');
    }

    logger.info(`Added comment to Linear issue ${issueId}`);

    return true;
  }
}
