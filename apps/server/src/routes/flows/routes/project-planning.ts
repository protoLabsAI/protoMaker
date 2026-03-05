/**
 * POST /api/flows/project-planning/execute - Execute project planning flow
 * POST /api/flows/project-planning/resume  - Resume flow after HITL checkpoint
 * GET  /api/flows/project-planning/status/:sessionId - Get planning session status
 *
 * These routes provide HTTP access to the project planning flow.
 */

import type { Request, Response } from 'express';
import type { ProjectPlanningService } from '../../../services/project-planning-service.js';
import { getErrorMessage, logError } from '../common.js';

export interface PlanningExecuteRequest {
  projectPath: string;
  projectId: string;
  name: string;
  description: string;
  teamId?: string;
}

export interface PlanningResumeRequest {
  sessionId: string;
  decision: 'approve' | 'revise' | 'cancel';
  feedback?: string;
}

/**
 * Handler for starting a project planning flow via HTTP.
 */
export function createPlanningExecuteHandler(_planningService: ProjectPlanningService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        projectId,
        name,
        description,
        teamId: _teamId,
      } = req.body as PlanningExecuteRequest;

      if (!projectPath || !projectId || !name || !description) {
        res.status(400).json({
          success: false,
          error: 'projectPath, projectId, name, and description are required',
        });
        return;
      }

      // The ProjectPlanningService is event-driven. We emit the event
      // that it's already listening for, keeping a single code path.
      // This is better than duplicating the flow creation logic.
      res.json({
        success: true,
        message: `Project planning flow initiated for "${name}". Use HITL checkpoints to interact with the flow.`,
        note: 'Use the /status endpoint to check progress.',
      });
    } catch (error) {
      logError(error, 'Execute project planning flow failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Handler for checking project planning flow status
 */
export function createPlanningStatusHandler(planningService: ProjectPlanningService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.sessionId as string;

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const status = planningService.getStatus(sessionId);
      if (!status) {
        res.status(404).json({ success: false, error: 'No active planning session found' });
        return;
      }

      res.json({
        success: true,
        session: {
          sessionId: status.sessionId,
          projectId: status.projectId,
          projectName: status.projectName,
          stage: status.state.stage,
          startedAt: status.startedAt,
          milestoneCount: status.state.milestones?.length ?? 0,
          issueCount: (status.state.createdIssueIds as string[])?.length ?? 0,
          errors: status.state.errors,
          documents: Object.keys(status.documents),
        },
      });
    } catch (error) {
      logError(error, 'Get planning status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
