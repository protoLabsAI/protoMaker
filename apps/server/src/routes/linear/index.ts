/**
 * Linear routes - HTTP API for Linear project management integration
 *
 * Provides native endpoints for Linear API operations, replacing the
 * third-party mcp-linear package with a built-in solution.
 *
 * Endpoints:
 * - POST /api/linear/health - Check connection status
 * - POST /api/linear/viewer - Get authenticated user
 * - POST /api/linear/teams - List teams
 * - POST /api/linear/workflow-states - Get workflow states for a team
 * - POST /api/linear/projects - List projects
 * - POST /api/linear/issues/search - Search issues
 * - POST /api/linear/issues/get - Get issue by ID
 * - POST /api/linear/issues/create - Create issue
 * - POST /api/linear/issues/update - Update issue
 * - POST /api/linear/issues/user - Get user's issues
 * - POST /api/linear/comments/create - Add comment to issue
 * - POST /api/linear/labels - Get all labels
 * - POST /api/linear/users - Get all users
 * - POST /api/linear/organization - Get organization info
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { LinearClientService, getLinearClientService } from '../../services/linear-client.js';
import type { SettingsService } from '../../services/settings-service.js';

const logger = createLogger('LinearRoutes');

/**
 * Create the Linear router
 */
export function createLinearRoutes(settingsService: SettingsService): Router {
  const router = Router();
  const linearClient = getLinearClientService(settingsService);

  // ============================================================================
  // Health & Connection
  // ============================================================================

  /**
   * Check Linear connection health
   */
  router.post('/health', async (_req: Request, res: Response) => {
    try {
      const status = await linearClient.checkHealth();
      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Health check failed:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // User & Organization
  // ============================================================================

  /**
   * Get authenticated user (viewer)
   */
  router.post('/viewer', async (_req: Request, res: Response) => {
    try {
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const viewer = await linearClient.getViewer();
      res.json({
        id: viewer.id,
        name: viewer.name,
        displayName: viewer.displayName,
        email: viewer.email,
        admin: viewer.admin,
        active: viewer.active,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get viewer failed:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Get organization info
   */
  router.post('/organization', async (_req: Request, res: Response) => {
    try {
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const org = await linearClient.getOrganization();
      res.json({
        id: org.id,
        name: org.name,
        urlKey: org.urlKey,
        logoUrl: org.logoUrl,
        createdAt: org.createdAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get organization failed:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Get all users
   */
  router.post('/users', async (_req: Request, res: Response) => {
    try {
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const users = await linearClient.getUsers();
      res.json({
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          displayName: u.displayName,
          email: u.email,
          admin: u.admin,
          active: u.active,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get users failed:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // Teams & Workflow States
  // ============================================================================

  /**
   * Get all teams
   */
  router.post('/teams', async (_req: Request, res: Response) => {
    try {
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const teams = await linearClient.getTeams();
      res.json({
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          key: t.key,
          description: t.description,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get teams failed:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Get workflow states for a team
   */
  router.post('/workflow-states', async (req: Request, res: Response) => {
    try {
      const { teamId } = req.body;
      if (!teamId) {
        res.status(400).json({ error: 'teamId is required' });
        return;
      }
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const states = await linearClient.getWorkflowStates(teamId);
      res.json({
        states: states.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          position: s.position,
          color: s.color,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get workflow states failed:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // Projects
  // ============================================================================

  /**
   * Get all projects
   */
  router.post('/projects', async (_req: Request, res: Response) => {
    try {
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const projects = await linearClient.getProjects();
      res.json({
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          state: p.state,
          startDate: p.startDate,
          targetDate: p.targetDate,
          progress: p.progress,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get projects failed:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // Issues
  // ============================================================================

  /**
   * Search issues
   */
  router.post('/issues/search', async (req: Request, res: Response) => {
    try {
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const {
        query,
        teamId,
        projectId,
        assigneeId,
        status,
        priority,
        labels,
        limit,
        includeArchived,
      } = req.body;

      const issues = await linearClient.searchIssues({
        query,
        teamId,
        projectId,
        assigneeId,
        status,
        priority,
        labels,
        limit,
        includeArchived,
      });

      res.json({
        issues: await Promise.all(
          issues.map(async (i) => {
            const state = await i.state;
            const assignee = await i.assignee;
            const team = await i.team;
            return {
              id: i.id,
              identifier: i.identifier,
              title: i.title,
              description: i.description,
              priority: i.priority,
              priorityLabel: i.priorityLabel,
              estimate: i.estimate,
              dueDate: i.dueDate,
              state: state ? { id: state.id, name: state.name, type: state.type } : null,
              assignee: assignee
                ? { id: assignee.id, name: assignee.name, email: assignee.email }
                : null,
              team: team ? { id: team.id, name: team.name, key: team.key } : null,
              url: i.url,
              createdAt: i.createdAt,
              updatedAt: i.updatedAt,
            };
          })
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Search issues failed:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Get issue by ID
   */
  router.post('/issues/get', async (req: Request, res: Response) => {
    try {
      const { issueId } = req.body;
      if (!issueId) {
        res.status(400).json({ error: 'issueId is required' });
        return;
      }
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const issue = await linearClient.getIssue(issueId);
      const state = await issue.state;
      const assignee = await issue.assignee;
      const team = await issue.team;

      res.json({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        estimate: issue.estimate,
        dueDate: issue.dueDate,
        state: state ? { id: state.id, name: state.name, type: state.type } : null,
        assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
        team: team ? { id: team.id, name: team.name, key: team.key } : null,
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get issue failed:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Create issue
   */
  router.post('/issues/create', async (req: Request, res: Response) => {
    try {
      const {
        title,
        description,
        teamId,
        projectId,
        priority,
        stateId,
        assigneeId,
        labelIds,
        estimate,
        dueDate,
      } = req.body;

      if (!title || !teamId) {
        res.status(400).json({ error: 'title and teamId are required' });
        return;
      }
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }

      const issue = await linearClient.createIssue({
        title,
        description,
        teamId,
        projectId,
        priority,
        stateId,
        assigneeId,
        labelIds,
        estimate,
        dueDate,
      });

      res.json({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Create issue failed:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Update issue
   */
  router.post('/issues/update', async (req: Request, res: Response) => {
    try {
      const { id, title, description, priority, stateId, assigneeId, labelIds, estimate, dueDate } =
        req.body;

      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }

      const issue = await linearClient.updateIssue(id, {
        title,
        description,
        priority,
        stateId,
        assigneeId,
        labelIds,
        estimate,
        dueDate,
      });

      res.json({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Update issue failed:', message);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Get user's issues
   */
  router.post('/issues/user', async (req: Request, res: Response) => {
    try {
      const { userId, limit, includeArchived } = req.body;

      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }

      const issues = await linearClient.getUserIssues(userId, limit, includeArchived);

      res.json({
        issues: await Promise.all(
          issues.map(async (i) => {
            const state = await i.state;
            const team = await i.team;
            return {
              id: i.id,
              identifier: i.identifier,
              title: i.title,
              priority: i.priority,
              priorityLabel: i.priorityLabel,
              state: state ? { id: state.id, name: state.name, type: state.type } : null,
              team: team ? { id: team.id, name: team.name, key: team.key } : null,
              url: i.url,
              updatedAt: i.updatedAt,
            };
          })
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get user issues failed:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // Comments
  // ============================================================================

  /**
   * Add comment to issue
   */
  router.post('/comments/create', async (req: Request, res: Response) => {
    try {
      const { issueId, body, createAsUser, displayIconUrl } = req.body;

      if (!issueId || !body) {
        res.status(400).json({ error: 'issueId and body are required' });
        return;
      }
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }

      const comment = await linearClient.addComment(issueId, body, createAsUser, displayIconUrl);

      res.json({
        id: comment.id,
        body: comment.body,
        url: comment.url,
        createdAt: comment.createdAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Create comment failed:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // Labels
  // ============================================================================

  /**
   * Get all labels
   */
  router.post('/labels', async (_req: Request, res: Response) => {
    try {
      if (!linearClient.isConnected()) {
        res.status(503).json({ error: 'Linear client not connected' });
        return;
      }
      const labels = await linearClient.getLabels();
      res.json({
        labels: labels.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          description: l.description,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get labels failed:', message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
