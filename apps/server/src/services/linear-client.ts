/**
 * Linear Client Service - Native Linear API client using @linear/sdk
 *
 * Replaces third-party npx mcp-linear package with a reliable, built-in solution.
 * Stores API key in credentials.json alongside ANTHROPIC_API_KEY.
 * Provides health checking, key validation, and graceful key rotation.
 */

import { LinearClient } from '@linear/sdk';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';
import type {
  User,
  Team,
  Project,
  Issue,
  WorkflowState,
  IssueLabel,
  Comment,
  Organization,
} from '@linear/sdk';

const logger = createLogger('LinearClient');

/**
 * Health status for the Linear client
 */
export interface LinearHealthStatus {
  /** Whether the client is initialized and connected */
  connected: boolean;
  /** Error message if not connected */
  error?: string;
  /** The authenticated user's display name */
  userName?: string;
  /** The authenticated user's email */
  userEmail?: string;
  /** The organization name */
  organizationName?: string;
  /** Timestamp of last successful connection check */
  lastChecked?: string;
}

/**
 * Issue creation parameters
 */
export interface CreateIssueParams {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  labelIds?: string[];
  estimate?: number;
  dueDate?: string;
}

/**
 * Issue update parameters
 */
export interface UpdateIssueParams {
  title?: string;
  description?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  labelIds?: string[];
  estimate?: number;
  dueDate?: string;
}

/**
 * Issue search parameters
 */
export interface SearchIssuesParams {
  query?: string;
  teamId?: string;
  projectId?: string;
  assigneeId?: string;
  status?: string;
  priority?: number;
  labels?: string[];
  limit?: number;
  includeArchived?: boolean;
}

/**
 * Linear Client Service
 *
 * Provides a native interface to the Linear API without relying on
 * external MCP servers. Key features:
 * - API key stored in credentials.json (not env vars)
 * - Health check on startup with clear error messages
 * - Key rotation without server restart
 * - Full Linear SDK access for all operations
 */
export class LinearClientService {
  private client: LinearClient | null = null;
  private settingsService: SettingsService;
  private lastHealthCheck: LinearHealthStatus | null = null;
  private initialized = false;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  /**
   * Initialize the Linear client with API key from credentials
   * Returns true if initialization succeeded, false otherwise
   */
  async initialize(): Promise<boolean> {
    try {
      const credentials = await this.settingsService.getCredentials();
      const apiKey = credentials.apiKeys.linear;

      if (!apiKey) {
        logger.info('Linear API key not configured - Linear features disabled');
        this.lastHealthCheck = {
          connected: false,
          error: 'Linear API key not configured. Set it in Settings → API Keys.',
          lastChecked: new Date().toISOString(),
        };
        return false;
      }

      this.client = new LinearClient({ apiKey });

      // Validate connection by fetching the authenticated user
      const health = await this.checkHealth();
      this.initialized = health.connected;

      if (!health.connected) {
        logger.warn(`Linear connection failed: ${health.error}`);
        this.client = null;
      } else {
        logger.info(
          `Linear connected as ${health.userName} (${health.userEmail}) - ${health.organizationName}`
        );
      }

      return this.initialized;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize Linear client: ${message}`);
      this.lastHealthCheck = {
        connected: false,
        error: message,
        lastChecked: new Date().toISOString(),
      };
      return false;
    }
  }

  /**
   * Update the API key and reinitialize the client
   * Allows key rotation without server restart
   */
  async updateApiKey(apiKey: string): Promise<boolean> {
    // Save the new key to credentials
    const credentials = await this.settingsService.getCredentials();
    await this.settingsService.updateCredentials({
      apiKeys: {
        ...credentials.apiKeys,
        linear: apiKey,
      },
    });

    // Reinitialize with the new key
    this.client = null;
    this.initialized = false;
    return this.initialize();
  }

  /**
   * Check health/connection status
   */
  async checkHealth(): Promise<LinearHealthStatus> {
    if (!this.client) {
      const status: LinearHealthStatus = {
        connected: false,
        error: 'Linear client not initialized',
        lastChecked: new Date().toISOString(),
      };
      this.lastHealthCheck = status;
      return status;
    }

    try {
      const viewer = await this.client.viewer;
      const org = await this.client.organization;

      const status: LinearHealthStatus = {
        connected: true,
        userName: viewer.displayName || viewer.name,
        userEmail: viewer.email,
        organizationName: org.name,
        lastChecked: new Date().toISOString(),
      };
      this.lastHealthCheck = status;
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status: LinearHealthStatus = {
        connected: false,
        error: `Linear API error: ${message}`,
        lastChecked: new Date().toISOString(),
      };
      this.lastHealthCheck = status;
      return status;
    }
  }

  /**
   * Get the last health check result without making a new request
   */
  getLastHealthCheck(): LinearHealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * Check if the client is initialized and connected
   */
  isConnected(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Ensure client is connected, throw if not
   */
  private ensureConnected(): void {
    if (!this.client) {
      throw new Error('Linear client not initialized. Check API key in Settings → API Keys.');
    }
  }

  // ============================================================================
  // User & Organization
  // ============================================================================

  /**
   * Get the authenticated user
   */
  async getViewer(): Promise<User> {
    this.ensureConnected();
    return this.client!.viewer;
  }

  /**
   * Get the organization
   */
  async getOrganization(): Promise<Organization> {
    this.ensureConnected();
    return this.client!.organization;
  }

  /**
   * Get all users in the organization
   */
  async getUsers(): Promise<User[]> {
    this.ensureConnected();
    const users = await this.client!.users();
    return users.nodes;
  }

  // ============================================================================
  // Teams
  // ============================================================================

  /**
   * Get all teams
   */
  async getTeams(): Promise<Team[]> {
    this.ensureConnected();
    const teams = await this.client!.teams();
    return teams.nodes;
  }

  /**
   * Get a specific team by ID
   */
  async getTeam(teamId: string): Promise<Team> {
    this.ensureConnected();
    return this.client!.team(teamId);
  }

  /**
   * Get workflow states for a team
   */
  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    this.ensureConnected();
    const team = await this.client!.team(teamId);
    const states = await team.states();
    return states.nodes;
  }

  // ============================================================================
  // Projects
  // ============================================================================

  /**
   * Get all projects
   */
  async getProjects(): Promise<Project[]> {
    this.ensureConnected();
    const projects = await this.client!.projects();
    return projects.nodes;
  }

  /**
   * Get a specific project by ID
   */
  async getProject(projectId: string): Promise<Project> {
    this.ensureConnected();
    return this.client!.project(projectId);
  }

  // ============================================================================
  // Issues
  // ============================================================================

  /**
   * Get an issue by ID
   */
  async getIssue(issueId: string): Promise<Issue> {
    this.ensureConnected();
    return this.client!.issue(issueId);
  }

  /**
   * Search issues with filters
   * Note: When using query search, results are IssueSearchResult which have fewer fields.
   * For full Issue objects, use without query or use getIssue() on the returned IDs.
   */
  async searchIssues(params: SearchIssuesParams): Promise<Issue[]> {
    this.ensureConnected();

    // Build filter object
    const filter: Record<string, unknown> = {};

    if (params.teamId) {
      filter.team = { id: { eq: params.teamId } };
    }

    if (params.projectId) {
      filter.project = { id: { eq: params.projectId } };
    }

    if (params.assigneeId) {
      filter.assignee = { id: { eq: params.assigneeId } };
    }

    if (params.status) {
      filter.state = { name: { eq: params.status } };
    }

    if (params.priority !== undefined) {
      filter.priority = { eq: params.priority };
    }

    if (params.labels && params.labels.length > 0) {
      filter.labels = { name: { in: params.labels } };
    }

    // Use issues filter for all cases since it returns full Issue objects
    // Query-based search returns limited IssueSearchResult type
    // For text search, we still use filters which work on title/description
    const issuesResult = await this.client!.issues({
      filter: params.query
        ? {
            ...filter,
            or: [
              { title: { containsIgnoreCase: params.query } },
              { description: { containsIgnoreCase: params.query } },
            ],
          }
        : filter,
      first: params.limit || 10,
      includeArchived: params.includeArchived,
    });
    return issuesResult.nodes;
  }

  /**
   * Create a new issue
   */
  async createIssue(params: CreateIssueParams): Promise<Issue> {
    this.ensureConnected();

    const result = await this.client!.createIssue({
      title: params.title,
      description: params.description,
      teamId: params.teamId,
      projectId: params.projectId,
      priority: params.priority,
      stateId: params.stateId,
      assigneeId: params.assigneeId,
      labelIds: params.labelIds,
      estimate: params.estimate,
      dueDate: params.dueDate,
    });

    if (!result.success || !result.issue) {
      throw new Error('Failed to create issue');
    }

    return result.issue;
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueId: string, params: UpdateIssueParams): Promise<Issue> {
    this.ensureConnected();

    const result = await this.client!.updateIssue(issueId, {
      title: params.title,
      description: params.description,
      priority: params.priority,
      stateId: params.stateId,
      assigneeId: params.assigneeId,
      labelIds: params.labelIds,
      estimate: params.estimate,
      dueDate: params.dueDate,
    });

    if (!result.success || !result.issue) {
      throw new Error('Failed to update issue');
    }

    return result.issue;
  }

  /**
   * Get issues assigned to a user
   */
  async getUserIssues(userId?: string, limit = 50, includeArchived = false): Promise<Issue[]> {
    this.ensureConnected();

    // If no userId provided, get current user's issues
    const assigneeId = userId || (await this.client!.viewer).id;

    const issues = await this.client!.issues({
      filter: {
        assignee: { id: { eq: assigneeId } },
      },
      first: limit,
      includeArchived,
    });

    return issues.nodes;
  }

  // ============================================================================
  // Comments
  // ============================================================================

  /**
   * Add a comment to an issue
   */
  async addComment(
    issueId: string,
    body: string,
    createAsUser?: string,
    displayIconUrl?: string
  ): Promise<Comment> {
    this.ensureConnected();

    const result = await this.client!.createComment({
      issueId,
      body,
      createAsUser,
      displayIconUrl,
    });

    if (!result.success || !result.comment) {
      throw new Error('Failed to add comment');
    }

    return result.comment;
  }

  // ============================================================================
  // Labels
  // ============================================================================

  /**
   * Get all labels
   */
  async getLabels(): Promise<IssueLabel[]> {
    this.ensureConnected();
    const labels = await this.client!.issueLabels();
    return labels.nodes;
  }
}

// Singleton instance (initialized lazily)
let instance: LinearClientService | null = null;

/**
 * Get or create the LinearClientService singleton
 */
export function getLinearClientService(settingsService: SettingsService): LinearClientService {
  if (!instance) {
    instance = new LinearClientService(settingsService);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetLinearClientService(): void {
  instance = null;
}
