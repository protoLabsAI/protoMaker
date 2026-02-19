/**
 * Engine Status Routes
 *
 * Real-time status of all engine services for the observability dashboard.
 *
 * POST /api/engine/status — Aggregated status of all services
 * POST /api/engine/events/history — Query buffered event history
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { LeadEngineerService } from '../../services/lead-engineer-service.js';
import type { PRFeedbackService } from '../../services/pr-feedback-service.js';
import type { ProjectService } from '../../services/project-service.js';
import type { EventStreamBuffer } from '../../lib/event-stream-buffer.js';
import type { ContentFlowService } from '../../services/content-flow-service.js';
import { getAllGraphs, getGraph } from '../../lib/graph-registry.js';

const logger = createLogger('EngineRoutes');

export function createEngineRoutes(
  autoModeService: AutoModeService,
  leadEngineerService: LeadEngineerService | undefined,
  prFeedbackService: PRFeedbackService,
  eventStreamBuffer?: EventStreamBuffer,
  projectService?: ProjectService,
  contentFlowService?: ContentFlowService
): Router {
  const router = Router();

  /**
   * POST /api/engine/status
   * Returns real-time status of all engine services.
   */
  router.post('/status', async (req: Request, res: Response) => {
    try {
      const { projectPath } = (req.body ?? {}) as { projectPath?: string };

      // Auto-mode status
      const autoModeStatus = autoModeService.getStatus();
      const runningAgents = await autoModeService.getRunningAgents();
      const activeWorktrees = autoModeService.getActiveAutoLoopWorktrees();

      // Lead engineer sessions
      const leadEngineerSessions = leadEngineerService ? leadEngineerService.getAllSessions() : [];

      // PR feedback tracked PRs
      const trackedPRs = prFeedbackService.getTrackedPRs();
      const remediationActive = trackedPRs.filter(
        (pr) => pr.reviewState === 'changes_requested'
      ).length;

      // Project lifecycle (optional — requires projectPath)
      let projectLifecycle: {
        totalProjects: number;
        activeProjects: number;
        activePRDs: number;
      } | null = null;

      if (projectService && projectPath) {
        try {
          const slugs = await projectService.listProjects(projectPath);
          const projects = (
            await Promise.all(slugs.map((s) => projectService.getProject(projectPath, s)))
          ).filter(Boolean);
          const active = projects.filter((p) => p && p.status !== 'completed');
          projectLifecycle = {
            totalProjects: projects.length,
            activeProjects: active.length,
            activePRDs: active.filter(
              (p) => p && (p.status === 'drafting' || p.status === 'reviewing')
            ).length,
          };
        } catch {
          // Project dir may not exist — that's fine
        }
      }

      res.json({
        success: true,
        signalIntake: {
          active: true,
          description: 'Classifies incoming signals (GitHub, Linear, Discord, MCP)',
        },
        autoMode: {
          running: autoModeStatus.isRunning,
          queueDepth: activeWorktrees.length,
          runningAgents: autoModeStatus.runningCount,
          runningFeatures: autoModeStatus.runningFeatures,
        },
        agentExecution: {
          activeAgents: runningAgents.map((a) => ({
            featureId: a.featureId,
            model: a.model,
            startTime: a.startTime,
            costUsd: a.costUsd,
            title: a.title,
            branchName: a.branchName,
            projectPath: a.projectPath,
          })),
        },
        gitWorkflow: {
          description: 'Handles commit, push, PR creation, and merge after agent completion',
        },
        prFeedback: {
          trackedPRs: trackedPRs.length,
          remediationActive,
          prs: trackedPRs.map((pr) => ({
            featureId: pr.featureId,
            prNumber: pr.prNumber,
            prUrl: pr.prUrl,
            reviewState: pr.reviewState,
            iterationCount: pr.iterationCount,
          })),
        },
        leadEngineer: {
          running: leadEngineerSessions.length > 0,
          sessions: leadEngineerSessions.map((s) => ({
            projectPath: s.projectPath,
            projectSlug: s.projectSlug,
            flowState: s.flowState,
            startedAt: s.startedAt,
            actionsTaken: s.actionsTaken,
          })),
        },
        projectLifecycle,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get engine status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get engine status',
      });
    }
  });

  /**
   * POST /api/engine/auto-mode/detail
   * Detailed auto-mode diagnostics: queue, running features, circuit breaker state.
   */
  router.post('/auto-mode/detail', async (_req: Request, res: Response) => {
    try {
      const status = autoModeService.getStatus();
      const agents = await autoModeService.getRunningAgents();
      const worktrees = autoModeService.getActiveAutoLoopWorktrees();

      res.json({
        success: true,
        running: status.isRunning,
        runningCount: status.runningCount,
        runningFeatures: status.runningFeatures,
        agents: agents.map((a) => ({
          featureId: a.featureId,
          model: a.model,
          provider: a.provider,
          startTime: a.startTime,
          costUsd: a.costUsd,
          title: a.title,
          description: a.description,
          branchName: a.branchName,
          projectPath: a.projectPath,
          projectName: a.projectName,
          duration: Date.now() - (a.startTime || Date.now()),
        })),
        activeWorktrees: worktrees.map((w) => ({
          projectPath: w.projectPath,
          branchName: w.branchName,
        })),
      });
    } catch (error) {
      logger.error('Failed to get auto-mode detail:', error);
      res.status(500).json({ success: false, error: 'Failed to get auto-mode detail' });
    }
  });

  /**
   * POST /api/engine/pr-feedback/detail
   * Detailed PR feedback: tracked PRs with review state, iteration counts.
   */
  router.post('/pr-feedback/detail', (_req: Request, res: Response) => {
    try {
      const trackedPRs = prFeedbackService.getTrackedPRs();

      res.json({
        success: true,
        trackedPRs: trackedPRs.map((pr) => ({
          featureId: pr.featureId,
          projectPath: pr.projectPath,
          prNumber: pr.prNumber,
          prUrl: pr.prUrl,
          branchName: pr.branchName,
          reviewState: pr.reviewState,
          iterationCount: pr.iterationCount,
          lastCheckedAt: pr.lastCheckedAt,
        })),
        totalTracked: trackedPRs.length,
        byState: {
          pending: trackedPRs.filter((pr) => pr.reviewState === 'pending').length,
          changes_requested: trackedPRs.filter((pr) => pr.reviewState === 'changes_requested')
            .length,
          approved: trackedPRs.filter((pr) => pr.reviewState === 'approved').length,
          commented: trackedPRs.filter((pr) => pr.reviewState === 'commented').length,
        },
      });
    } catch (error) {
      logger.error('Failed to get PR feedback detail:', error);
      res.status(500).json({ success: false, error: 'Failed to get PR feedback detail' });
    }
  });

  /**
   * POST /api/engine/lead-engineer/detail
   * Detailed lead engineer: sessions, world state, rule log.
   */
  router.post('/lead-engineer/detail', (_req: Request, res: Response) => {
    try {
      const sessions = leadEngineerService ? leadEngineerService.getAllSessions() : [];

      res.json({
        success: true,
        sessions: sessions.map((s) => ({
          projectPath: s.projectPath,
          projectSlug: s.projectSlug,
          flowState: s.flowState,
          startedAt: s.startedAt,
          actionsTaken: s.actionsTaken,
          ruleLog: s.ruleLog?.slice(-20) ?? [],
          worldState: s.worldState
            ? {
                boardCounts: s.worldState.boardCounts,
                agentCount: s.worldState.agents?.length ?? 0,
                openPRCount: s.worldState.openPRs?.length ?? 0,
                milestoneCount: s.worldState.milestones?.length ?? 0,
              }
            : null,
        })),
        totalSessions: sessions.length,
      });
    } catch (error) {
      logger.error('Failed to get lead engineer detail:', error);
      res.status(500).json({ success: false, error: 'Failed to get lead engineer detail' });
    }
  });

  /**
   * POST /api/engine/events/history
   * Query server-side event ring buffer with filters.
   */
  router.post('/events/history', (_req: Request, res: Response) => {
    try {
      if (!eventStreamBuffer) {
        res.json({ success: true, events: [], total: 0 });
        return;
      }

      const { type, service, featureId, since, until, limit } = (_req.body ?? {}) as {
        type?: string;
        service?: string;
        featureId?: string;
        since?: number;
        until?: number;
        limit?: number;
      };

      const result = eventStreamBuffer.query({
        type,
        service,
        featureId,
        since,
        until,
        limit: limit ?? 200,
      });

      res.json({
        success: true,
        events: result.events,
        total: result.total,
        bufferSize: eventStreamBuffer.size,
      });
    } catch (error) {
      logger.error('Failed to query event history:', error);
      res.status(500).json({ success: false, error: 'Failed to query event history' });
    }
  });

  /**
   * POST /api/engine/flows
   * Returns all LangGraph topology definitions and execution state.
   */
  router.post('/flows', (_req: Request, res: Response) => {
    try {
      const { graphId } = (_req.body ?? {}) as { graphId?: string };

      // If specific graph requested, return just that one
      if (graphId) {
        const graph = getGraph(graphId);
        if (!graph) {
          res.status(404).json({
            success: false,
            error: `Graph not found: ${graphId}`,
          });
          return;
        }

        res.json({
          success: true,
          graph,
        });
        return;
      }

      // Return all graphs with execution state
      const graphs = getAllGraphs();
      const executionState = contentFlowService ? contentFlowService.getExecutionState() : null;

      res.json({
        success: true,
        graphs,
        executionState,
        totalGraphs: graphs.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get flow definitions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get flow definitions',
      });
    }
  });

  return router;
}
