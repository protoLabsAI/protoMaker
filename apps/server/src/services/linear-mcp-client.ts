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
 * Options for creating an issue relation
 */
export interface CreateIssueRelationOptions {
  /** Source issue ID */
  issueId: string;
  /** Target issue ID */
  relatedIssueId: string;
  /** Relation type (blocks, blocked, duplicate, related) */
  type: 'blocks' | 'blocked' | 'duplicate' | 'related';
}

/**
 * Options for creating a Linear project milestone
 */
export interface CreateProjectMilestoneOptions {
  /** Project ID to create milestone in */
  projectId: string;
  /** Milestone name */
  name: string;
  /** Milestone description (optional) */
  description?: string;
  /** Target date (ISO string, optional) */
  targetDate?: string;
  /** Sort order (optional) */
  sortOrder?: number;
}

/**
 * Options for updating a Linear project milestone
 */
export interface UpdateProjectMilestoneOptions {
  /** New name (optional) */
  name?: string;
  /** New description (optional) */
  description?: string;
  /** New target date (optional) */
  targetDate?: string;
  /** New sort order (optional) */
  sortOrder?: number;
}

/**
 * Result of a project milestone operation
 */
export interface ProjectMilestoneResult {
  /** Milestone ID */
  id: string;
  /** Milestone name */
  name: string;
}

/**
 * Options for updating a Linear project
 */
export interface UpdateProjectOptions {
  /** New project name (optional) */
  name?: string;
  /** New project description (optional) */
  description?: string;
  /** New project status (optional) */
  status?: string;
  /** New project progress percentage (optional, 0-100) */
  progress?: number;
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
  async executeGraphQL<T = unknown>(query: string, variables: Record<string, unknown>): Promise<T> {
    const accessToken = await this.getAccessToken();

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

  /**
   * Create an issue relation
   *
   * @param options - Issue relation options
   * @returns True if relation created successfully
   * @throws {LinearAPIError} On API errors
   */
  async createIssueRelation(options: CreateIssueRelationOptions): Promise<boolean> {
    const { issueId, relatedIssueId, type } = options;

    const mutation = `
      mutation CreateIssueRelation(
        $issueId: String!
        $relatedIssueId: String!
        $type: IssueRelationType!
      ) {
        issueRelationCreate(
          input: {
            issueId: $issueId
            relatedIssueId: $relatedIssueId
            type: $type
          }
        ) {
          success
          issueRelation {
            id
            type
          }
        }
      }
    `;

    const variables = {
      issueId,
      relatedIssueId,
      type,
    };

    interface CreateIssueRelationResponse {
      issueRelationCreate: {
        success: boolean;
        issueRelation: {
          id: string;
          type: string;
        };
      };
    }

    const data = await this.executeGraphQL<CreateIssueRelationResponse>(mutation, variables);

    if (!data.issueRelationCreate.success) {
      throw new LinearAPIError('Failed to create issue relation');
    }

    logger.info(
      `Created issue relation: ${type} (${issueId} -> ${relatedIssueId}), id: ${data.issueRelationCreate.issueRelation.id}`
    );

    return true;
  }

  /**
   * Get existing issue relations for an issue
   *
   * @param issueId - The issue ID to get relations for
   * @returns Array of related issue IDs
   * @throws {LinearAPIError} On API errors
   */
  async getIssueRelations(issueId: string): Promise<Array<{ id: string; type: string }>> {
    const query = `
      query GetIssueRelations($issueId: String!) {
        issue(id: $issueId) {
          id
          relations {
            nodes {
              id
              type
              relatedIssue {
                id
              }
            }
          }
        }
      }
    `;

    const variables = { issueId };

    interface GetIssueRelationsResponse {
      issue: {
        id: string;
        relations: {
          nodes: Array<{
            id: string;
            type: string;
            relatedIssue: {
              id: string;
            };
          }>;
        };
      };
    }

    const data = await this.executeGraphQL<GetIssueRelationsResponse>(query, variables);

    return data.issue.relations.nodes.map((relation) => ({
      id: relation.relatedIssue.id,
      type: relation.type,
    }));
  }

  /**
   * Update an existing Linear project
   *
   * @param projectId - The project ID to update
   * @param options - Update options
   * @returns True if update succeeded
   * @throws {LinearAPIError} On API errors
   */
  async updateProject(projectId: string, options: UpdateProjectOptions): Promise<boolean> {
    const { name, description, status, progress } = options;

    const mutation = `
      mutation UpdateProject(
        $projectId: String!
        $name: String
        $description: String
        $state: String
        $progress: Float
      ) {
        projectUpdate(
          id: $projectId
          input: {
            name: $name
            description: $description
            state: $state
            progress: $progress
          }
        ) {
          success
          project {
            id
            name
          }
        }
      }
    `;

    const variables = {
      projectId,
      name,
      description,
      state: status,
      progress: progress !== undefined ? progress / 100 : undefined, // Convert percentage to 0-1
    };

    interface UpdateProjectResponse {
      projectUpdate: {
        success: boolean;
        project: {
          id: string;
          name: string;
        };
      };
    }

    const data = await this.executeGraphQL<UpdateProjectResponse>(mutation, variables);

    if (!data.projectUpdate.success) {
      throw new LinearAPIError('Failed to update Linear project');
    }

    logger.info(`Updated Linear project: ${data.projectUpdate.project.name}`);

    return true;
  }

  /**
   * List milestones for a Linear project
   *
   * @param projectId - The project ID
   * @returns Array of milestones with id and name
   * @throws {LinearAPIError} On API errors
   */
  async listProjectMilestones(
    projectId: string
  ): Promise<Array<{ id: string; name: string; description?: string; sortOrder: number }>> {
    const query = `
      query ListProjectMilestones($projectId: String!) {
        project(id: $projectId) {
          projectMilestones {
            nodes {
              id
              name
              description
              sortOrder
            }
          }
        }
      }
    `;

    interface ListMilestonesResponse {
      project: {
        projectMilestones: {
          nodes: Array<{
            id: string;
            name: string;
            description?: string;
            sortOrder: number;
          }>;
        };
      };
    }

    const data = await this.executeGraphQL<ListMilestonesResponse>(query, { projectId });

    return data.project.projectMilestones.nodes;
  }

  /**
   * Create a milestone in a Linear project
   *
   * @param options - Milestone creation options
   * @returns Created milestone ID and name
   * @throws {LinearAPIError} On API errors
   */
  async createProjectMilestone(
    options: CreateProjectMilestoneOptions
  ): Promise<ProjectMilestoneResult> {
    const { projectId, name, description, targetDate, sortOrder } = options;

    const mutation = `
      mutation CreateProjectMilestone(
        $projectId: String!
        $name: String!
        $description: String
        $targetDate: TimelessDate
        $sortOrder: Float
      ) {
        projectMilestoneCreate(
          input: {
            projectId: $projectId
            name: $name
            description: $description
            targetDate: $targetDate
            sortOrder: $sortOrder
          }
        ) {
          success
          projectMilestone {
            id
            name
          }
        }
      }
    `;

    interface CreateMilestoneResponse {
      projectMilestoneCreate: {
        success: boolean;
        projectMilestone: {
          id: string;
          name: string;
        };
      };
    }

    const data = await this.executeGraphQL<CreateMilestoneResponse>(mutation, {
      projectId,
      name,
      description,
      targetDate,
      sortOrder,
    });

    if (!data.projectMilestoneCreate.success) {
      throw new LinearAPIError('Failed to create project milestone');
    }

    logger.info(
      `Created project milestone: ${name} (${data.projectMilestoneCreate.projectMilestone.id})`
    );

    return data.projectMilestoneCreate.projectMilestone;
  }

  /**
   * Update an existing project milestone
   *
   * @param milestoneId - The milestone ID to update
   * @param options - Update options
   * @returns True if update succeeded
   * @throws {LinearAPIError} On API errors
   */
  async updateProjectMilestone(
    milestoneId: string,
    options: UpdateProjectMilestoneOptions
  ): Promise<boolean> {
    const { name, description, targetDate, sortOrder } = options;

    const mutation = `
      mutation UpdateProjectMilestone(
        $milestoneId: String!
        $name: String
        $description: String
        $targetDate: TimelessDate
        $sortOrder: Float
      ) {
        projectMilestoneUpdate(
          id: $milestoneId
          input: {
            name: $name
            description: $description
            targetDate: $targetDate
            sortOrder: $sortOrder
          }
        ) {
          success
          projectMilestone {
            id
            name
          }
        }
      }
    `;

    interface UpdateMilestoneResponse {
      projectMilestoneUpdate: {
        success: boolean;
        projectMilestone: {
          id: string;
          name: string;
        };
      };
    }

    const data = await this.executeGraphQL<UpdateMilestoneResponse>(mutation, {
      milestoneId,
      name,
      description,
      targetDate,
      sortOrder,
    });

    if (!data.projectMilestoneUpdate.success) {
      throw new LinearAPIError('Failed to update project milestone');
    }

    logger.info(`Updated project milestone: ${data.projectMilestoneUpdate.projectMilestone.name}`);

    return true;
  }

  /**
   * Delete a project milestone
   *
   * @param milestoneId - The milestone ID to delete
   * @returns True if deletion succeeded
   * @throws {LinearAPIError} On API errors
   */
  async deleteProjectMilestone(milestoneId: string): Promise<boolean> {
    const mutation = `
      mutation DeleteProjectMilestone($milestoneId: String!) {
        projectMilestoneDelete(id: $milestoneId) {
          success
        }
      }
    `;

    interface DeleteMilestoneResponse {
      projectMilestoneDelete: {
        success: boolean;
      };
    }

    const data = await this.executeGraphQL<DeleteMilestoneResponse>(mutation, { milestoneId });

    if (!data.projectMilestoneDelete.success) {
      throw new LinearAPIError('Failed to delete project milestone');
    }

    logger.info(`Deleted project milestone: ${milestoneId}`);

    return true;
  }

  /**
   * Assign an issue to a project milestone
   *
   * @param issueId - The issue ID to assign
   * @param projectMilestoneId - The project milestone ID
   * @returns True if assignment succeeded
   * @throws {LinearAPIError} On API errors
   */
  async assignIssueToMilestone(issueId: string, projectMilestoneId: string): Promise<boolean> {
    const mutation = `
      mutation AssignIssueToMilestone($issueId: String!, $projectMilestoneId: String!) {
        issueUpdate(
          id: $issueId
          input: {
            projectMilestoneId: $projectMilestoneId
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

    interface AssignMilestoneResponse {
      issueUpdate: {
        success: boolean;
        issue: {
          id: string;
          identifier: string;
        };
      };
    }

    const data = await this.executeGraphQL<AssignMilestoneResponse>(mutation, {
      issueId,
      projectMilestoneId,
    });

    if (!data.issueUpdate.success) {
      throw new LinearAPIError('Failed to assign issue to milestone');
    }

    logger.info(
      `Assigned issue ${data.issueUpdate.issue.identifier} to milestone ${projectMilestoneId}`
    );

    return true;
  }

  /**
   * Get all issues in a Linear project with their parent/children info
   *
   * @param projectId - The project ID
   * @returns Array of issues with id, identifier, title, parent info, and children
   * @throws {LinearAPIError} On API errors
   */
  async getProjectIssues(projectId: string): Promise<
    Array<{
      id: string;
      identifier: string;
      title: string;
      parent?: { id: string; identifier: string; title: string };
      children: Array<{ id: string; identifier: string; title: string }>;
      projectMilestone?: { id: string; name: string };
    }>
  > {
    const query = `
      query GetProjectIssues($projectId: String!) {
        project(id: $projectId) {
          issues {
            nodes {
              id
              identifier
              title
              parent {
                id
                identifier
                title
              }
              children {
                nodes {
                  id
                  identifier
                  title
                }
              }
              projectMilestone {
                id
                name
              }
            }
          }
        }
      }
    `;

    interface GetProjectIssuesResponse {
      project: {
        issues: {
          nodes: Array<{
            id: string;
            identifier: string;
            title: string;
            parent?: { id: string; identifier: string; title: string };
            children: {
              nodes: Array<{ id: string; identifier: string; title: string }>;
            };
            projectMilestone?: { id: string; name: string };
          }>;
        };
      };
    }

    const data = await this.executeGraphQL<GetProjectIssuesResponse>(query, { projectId });

    return data.project.issues.nodes.map((issue) => ({
      ...issue,
      children: issue.children.nodes,
    }));
  }

  /**
   * Search for Linear projects by name
   */
  async searchProjects(
    query: string
  ): Promise<Array<{ id: string; name: string; url: string; state: string }>> {
    const gql = `
      query SearchProjects($query: String!) {
        projects(filter: { name: { containsIgnoreCase: $query } }, first: 10) {
          nodes {
            id
            name
            url
            state
          }
        }
      }
    `;

    interface SearchProjectsResponse {
      projects: {
        nodes: Array<{ id: string; name: string; url: string; state: string }>;
      };
    }

    const data = await this.executeGraphQL<SearchProjectsResponse>(gql, { query });
    return data.projects.nodes;
  }

  /**
   * Search for Linear issues by text query
   */
  async searchIssuesText(
    query: string
  ): Promise<Array<{ id: string; identifier: string; title: string; url: string }>> {
    const gql = `
      query SearchIssues($query: String!) {
        issueSearch(query: $query, first: 20) {
          nodes {
            id
            identifier
            title
            url
          }
        }
      }
    `;

    interface SearchIssuesResponse {
      issueSearch: {
        nodes: Array<{ id: string; identifier: string; title: string; url: string }>;
      };
    }

    const data = await this.executeGraphQL<SearchIssuesResponse>(gql, { query });
    return data.issueSearch.nodes;
  }
}
