/**
 * Linear Monitor Service
 *
 * Monitors Linear projects for new work items for headsdown agents.
 * Used by Engineering Manager agents to detect approved projects needing breakdown.
 */

import type { EventEmitter } from '../lib/events.js';
import type { LinearMonitorConfig, WorkItem } from '@automaker/types';
import type { SettingsService } from './settings-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LinearMonitor');

/**
 * Linear project with metadata
 */
export interface LinearProjectItem {
  id: string;
  name: string;
  description?: string;
  status: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

/**
 * Linear issue with metadata
 */
export interface LinearIssueItem {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  description?: string;
  status: string;
  assigneeId?: string;
  projectId?: string;
  labels: string[];
  priority: number;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

/**
 * LinearMonitor - Polls Linear for new projects and issues
 *
 * Used by headsdown agents (especially Engineering Manager) to detect:
 * - New projects needing feature breakdown
 * - Assigned issues for engineers to implement
 * - Status updates on ongoing work
 */
export class LinearMonitor {
  /** Last project update timestamp per project */
  private lastUpdateTimes = new Map<string, string>();

  /** Active polling intervals */
  private intervals = new Map<string, NodeJS.Timeout>();

  /** Settings service for reading OAuth token */
  private settingsService?: SettingsService;

  /** Project path for reading settings */
  private projectPath?: string;

  constructor(private events: EventEmitter) {}

  /**
   * Set settings service and project path for token retrieval
   */
  setSettingsService(settingsService: SettingsService, projectPath: string): void {
    this.settingsService = settingsService;
    this.projectPath = projectPath;
  }

  /**
   * Start monitoring Linear projects
   */
  async startMonitoring(config: LinearMonitorConfig): Promise<void> {
    const { projectIds, labels = [], pollInterval = 30000 } = config;

    // Start polling loop for projects
    const interval = setInterval(async () => {
      try {
        await this.pollProjects(projectIds, labels);
      } catch (error) {
        logger.error(`Error polling Linear projects:`, error);
      }
    }, pollInterval);

    this.intervals.set('projects', interval);
    logger.info(`Started monitoring ${projectIds.length} Linear projects`);
  }

  /**
   * Stop all monitoring
   */
  stopAll(): void {
    for (const [key, interval] of this.intervals.entries()) {
      clearInterval(interval);
      logger.info(`Stopped monitoring: ${key}`);
    }
    this.intervals.clear();
    this.lastUpdateTimes.clear();
  }

  /**
   * Poll projects for updates
   */
  private async pollProjects(projectIds: string[], labels: string[]): Promise<void> {
    for (const projectId of projectIds) {
      const project = await this.fetchProject(projectId);

      if (!project) {
        continue;
      }

      // Check if project was updated since last check
      const lastUpdate = this.lastUpdateTimes.get(projectId);

      if (!lastUpdate || new Date(project.updatedAt) > new Date(lastUpdate)) {
        // Project was updated - check if it needs processing
        this.lastUpdateTimes.set(projectId, project.updatedAt);

        // Emit event for EM agent to process
        this.events.emit('linear:project:updated', {
          project,
        });

        logger.info(`Detected update to Linear project: ${project.name}`);
      }

      // Also check for new issues in this project
      await this.pollIssues(projectId, labels);
    }
  }

  /**
   * Poll issues for a project
   */
  private async pollIssues(projectId: string, labels: string[]): Promise<void> {
    const issues = await this.fetchIssues(projectId, labels);

    for (const issue of issues) {
      // Emit event for engineer agents monitoring their role labels
      this.events.emit('linear:issue:detected', {
        issue,
        projectId,
      });
    }
  }

  /**
   * Get OAuth token from project settings
   */
  private async getToken(): Promise<string | null> {
    if (!this.settingsService || !this.projectPath) {
      logger.error('Settings service or project path not set');
      return null;
    }

    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const token = settings.integrations?.linear?.agentToken;

    if (!token) {
      logger.warn('Linear OAuth token not found in project settings');
      return null;
    }

    return token;
  }

  /**
   * Fetch project details from Linear using GraphQL API
   */
  private async fetchProject(projectId: string): Promise<LinearProjectItem | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }

    try {
      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            state
            teams {
              nodes {
                id
              }
            }
            createdAt
            updatedAt
            url
          }
        }
      `;

      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({
          query,
          variables: { id: projectId },
        }),
      });

      if (!response.ok) {
        logger.error(`Linear API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = (await response.json()) as {
        data?: {
          project?: {
            id: string;
            name: string;
            state: string;
            teams: { nodes: Array<{ id: string }> };
            createdAt: string;
            updatedAt: string;
            url?: string;
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (data.errors) {
        logger.error('Linear GraphQL errors:', data.errors);
        return null;
      }

      if (!data.data?.project) {
        logger.warn(`Project ${projectId} not found in Linear`);
        return null;
      }

      const project = data.data.project;
      return {
        id: project.id,
        name: project.name,
        description: undefined,
        status: project.state,
        teamId: project.teams.nodes[0]?.id || '',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        url: project.url,
      };
    } catch (error) {
      logger.error('Failed to fetch Linear project:', error);
      return null;
    }
  }

  /**
   * Fetch issues for a project using GraphQL API
   */
  private async fetchIssues(projectId: string, labels: string[]): Promise<LinearIssueItem[]> {
    const token = await this.getToken();
    if (!token) {
      return [];
    }

    try {
      const query = `
        query GetIssues($projectId: ID!) {
          issues(filter: { project: { id: { eq: $projectId } } }) {
            nodes {
              id
              identifier
              title
              description
              state {
                name
              }
              assignee {
                id
              }
              labels {
                nodes {
                  name
                }
              }
              priority
              createdAt
              updatedAt
              url
            }
          }
        }
      `;

      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({
          query,
          variables: { projectId },
        }),
      });

      if (!response.ok) {
        logger.error(`Linear API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as {
        data?: {
          issues?: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              description?: string;
              state: { name: string };
              assignee?: { id: string };
              labels: { nodes: Array<{ name: string }> };
              priority: number;
              createdAt: string;
              updatedAt: string;
              url?: string;
            }>;
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (data.errors) {
        logger.error('Linear GraphQL errors:', data.errors);
        return [];
      }

      if (!data.data?.issues?.nodes) {
        return [];
      }

      const issues = data.data.issues.nodes;

      // Filter by labels if specified
      const filteredIssues =
        labels.length > 0
          ? issues.filter((issue) =>
              labels.some((label) => issue.labels.nodes.some((l) => l.name === label))
            )
          : issues;

      return filteredIssues.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        status: issue.state.name,
        assigneeId: issue.assignee?.id,
        projectId,
        labels: issue.labels.nodes.map((l) => l.name),
        priority: issue.priority,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        url: issue.url,
      }));
    } catch (error) {
      logger.error('Failed to fetch Linear issues:', error);
      return [];
    }
  }

  /**
   * Convert Linear project to WorkItem for headsdown agents
   */
  static projectToWorkItem(project: LinearProjectItem): WorkItem {
    return {
      type: 'linear_issue', // Reuse this type for projects too
      id: project.id,
      priority: 2, // Medium priority - orchestration work
      description: `Linear project needs breakdown: "${project.name}"`,
      url: project.url,
      metadata: {
        projectId: project.id,
        projectName: project.name,
        teamId: project.teamId,
        status: project.status,
      },
    };
  }

  /**
   * Convert Linear issue to WorkItem for headsdown agents
   */
  static issueToWorkItem(issue: LinearIssueItem): WorkItem {
    return {
      type: 'linear_issue',
      id: issue.id,
      priority: issue.priority || 3,
      description: `Linear issue: ${issue.identifier} - ${issue.title}`,
      url: issue.url,
      metadata: {
        issueId: issue.id,
        identifier: issue.identifier,
        projectId: issue.projectId,
        assigneeId: issue.assigneeId,
        labels: issue.labels,
        status: issue.status,
      },
    };
  }

  /**
   * Get all monitored projects
   */
  getMonitoredProjects(): string[] {
    return Array.from(this.lastUpdateTimes.keys());
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.intervals.size > 0;
  }
}
