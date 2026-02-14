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
  /** Parent issue ID (for creating sub-issues) */
  parentId?: string;
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
 * Options for creating an Agent Session
 */
export interface CreateAgentSessionOptions {
  /** Issue ID to create session for */
  issueId: string;
  /** Activity type (e.g., "Elicitation") */
  activityType: string;
  /** The prompt/question for the human */
  prompt: string;
}

/**
 * Options for creating a Linear project
 */
export interface CreateProjectOptions {
  /** Project name */
  name: string;
  /** Project description (markdown) */
  description?: string;
  /** Team IDs to associate with the project */
  teamIds: string[];
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
 * Result of creating a Linear project
 */
export interface CreateProjectResult {
  /** Created project ID */
  projectId: string;
  /** Project URL */
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
   * Get Linear API token from project settings or environment.
   *
   * Priority: OAuth agentToken > settings apiKey > LINEAR_API_KEY env var
   *
   * @throws {LinearAPIError} If no token is configured
   */
  private async getAccessToken(): Promise<string> {
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const linearConfig = settings.integrations?.linear;

    // Priority 1: OAuth agent token (full delegated permissions)
    if (linearConfig?.agentToken) {
      return linearConfig.agentToken;
    }

    // Priority 2: Personal API key from project settings
    if (linearConfig?.apiKey) {
      return linearConfig.apiKey;
    }

    // Priority 3: Personal API key from environment variable (check both common names)
    const envToken = process.env.LINEAR_API_KEY || process.env.LINEAR_API_TOKEN;
    if (envToken) {
      return envToken;
    }

    throw new LinearAPIError(
      'No Linear API token configured. Set up OAuth, add apiKey to project settings, or set LINEAR_API_KEY env var.',
      undefined,
      true
    );
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
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
      clearTimeout(timeoutId);

      // Re-throw LinearAPIError as-is
      if (error instanceof LinearAPIError) {
        throw error;
      }

      // Handle timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LinearAPIError('Linear API request timed out after 30s');
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
    const { title, description, teamId, projectId, priority, labelIds, assigneeId, parentId } =
      options;

    const mutation = `
      mutation CreateIssue(
        $title: String!
        $description: String
        $teamId: String!
        $projectId: String
        $priority: Int
        $labelIds: [String!]
        $assigneeId: String
        $parentId: String
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
            parentId: $parentId
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
      parentId,
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

  /**
   * Create a new Linear project
   *
   * @param options - Project creation options
   * @returns Created project ID and URL
   * @throws {LinearAPIError} On API errors
   */
  async createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
    const { name, description, teamIds } = options;

    const mutation = `
      mutation CreateProject(
        $name: String!
        $description: String
        $teamIds: [String!]!
      ) {
        projectCreate(
          input: {
            name: $name
            description: $description
            teamIds: $teamIds
          }
        ) {
          success
          project {
            id
            url
          }
        }
      }
    `;

    const variables = {
      name,
      description,
      teamIds,
    };

    interface CreateProjectResponse {
      projectCreate: {
        success: boolean;
        project: {
          id: string;
          url: string;
        };
      };
    }

    const data = await this.executeGraphQL<CreateProjectResponse>(mutation, variables);

    if (!data.projectCreate.success) {
      throw new LinearAPIError('Failed to create Linear project');
    }

    logger.info(`Created Linear project: ${name} (${data.projectCreate.project.id})`);

    return {
      projectId: data.projectCreate.project.id,
      url: data.projectCreate.project.url,
    };
  }

  /**
   * Add an issue to a Linear project
   *
   * @param issueId - The issue ID to add
   * @param projectId - The project ID to add the issue to
   * @returns True if the issue was added successfully
   * @throws {LinearAPIError} On API errors
   */
  async addIssueToProject(issueId: string, projectId: string): Promise<boolean> {
    const mutation = `
      mutation AddIssueToProject($issueId: String!, $projectId: String!) {
        issueUpdate(
          id: $issueId
          input: {
            projectId: $projectId
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
      projectId,
    };

    interface AddIssueToProjectResponse {
      issueUpdate: {
        success: boolean;
        issue: {
          id: string;
          identifier: string;
        };
      };
    }

    const data = await this.executeGraphQL<AddIssueToProjectResponse>(mutation, variables);

    if (!data.issueUpdate.success) {
      throw new LinearAPIError('Failed to add issue to Linear project');
    }

    logger.info(`Added issue ${data.issueUpdate.issue.identifier} to project ${projectId}`);

    return true;
  }

  /**
   * Create an Agent Session for elicitation (human input request)
   *
   * @param options - Agent session creation options
   * @returns The created session ID
   * @throws {LinearAPIError} On API errors
   */
  async createAgentSession(options: CreateAgentSessionOptions): Promise<string> {
    const { issueId, activityType, prompt } = options;

    const mutation = `
      mutation CreateAgentSession(
        $issueId: String!
        $activityType: String!
        $prompt: String!
      ) {
        agentSessionCreate(
          input: {
            issueId: $issueId
            activityType: $activityType
            prompt: $prompt
          }
        ) {
          success
          agentSession {
            id
          }
        }
      }
    `;

    const variables = {
      issueId,
      activityType,
      prompt,
    };

    interface CreateAgentSessionResponse {
      agentSessionCreate: {
        success: boolean;
        agentSession: {
          id: string;
        };
      };
    }

    const data = await this.executeGraphQL<CreateAgentSessionResponse>(mutation, variables);

    if (!data.agentSessionCreate.success) {
      throw new LinearAPIError('Failed to create Agent Session in Linear');
    }

    logger.info(`Created Agent Session for issue ${issueId} with activity type ${activityType}`);

    return data.agentSessionCreate.agentSession.id;
  }

  /**
   * Get the "awaitingInput" state ID for a team
   *
   * @param teamId - The team ID to get the state for
   * @returns The state ID for "awaitingInput"
   * @throws {LinearAPIError} On API errors or if state not found
   */
  async getAwaitingInputStateId(teamId: string): Promise<string> {
    const query = `
      query GetAwaitingInputState($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    `;

    const variables = { teamId };

    interface GetAwaitingInputStateResponse {
      team: {
        states: {
          nodes: Array<{
            id: string;
            name: string;
            type: string;
          }>;
        };
      };
    }

    const data = await this.executeGraphQL<GetAwaitingInputStateResponse>(query, variables);

    // Look for "awaitingInput" state (case insensitive)
    const awaitingInputState = data.team.states.nodes.find(
      (state) =>
        state.name.toLowerCase() === 'awaitinginput' ||
        state.name.toLowerCase() === 'awaiting input'
    );

    if (!awaitingInputState) {
      throw new LinearAPIError(`Could not find "awaitingInput" state for team ${teamId}`);
    }

    return awaitingInputState.id;
  }
}
