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
import { createLogger } from '@protolabsai/utils';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { LeadEngineerService } from '../../services/lead-engineer-service.js';
import type { ProjectService } from '../../services/project-service.js';
import type { EventStreamBuffer } from '../../lib/event-stream-buffer.js';
import type { SignalIntakeService } from '../../services/signal-intake-service.js';
import type { GitWorkflowService } from '../../services/git-workflow-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { EventEmitter } from '../../lib/events.js';
import type { CompletionDetectorService } from '../../services/completion-detector-service.js';
import type { SettingsService } from '../../services/settings-service.js';

const logger = createLogger('EngineRoutes');

export function createEngineRoutes(
  autoModeService: AutoModeService,
  leadEngineerService: LeadEngineerService | undefined,
  signalIntakeService: SignalIntakeService,
  gitWorkflowService: GitWorkflowService,
  eventStreamBuffer?: EventStreamBuffer,
  projectService?: ProjectService,
  featureLoader?: FeatureLoader,
  events?: EventEmitter,
  completionDetectorService?: CompletionDetectorService,
  settingsService?: SettingsService
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

      // Git workflow status
      const gitWorkflowStatus = gitWorkflowService.getStatus();

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

      // Signal intake status
      const signalIntakeStatus = signalIntakeService.getStatus();

      res.json({
        success: true,
        signalIntake: {
          active: signalIntakeStatus.active,
          signalCounts: signalIntakeStatus.signalCounts,
          lastSignalAt: signalIntakeStatus.lastSignalAt,
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
          activeWorkflows: gitWorkflowStatus.activeWorkflows,
          recentOperations: gitWorkflowStatus.recentOperations,
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
        reflection: {
          completions: completionDetectorService?.getStatus() ?? {
            completionCounts: { epics: 0, milestones: 0, projects: 0 },
            emittedMilestones: 0,
            emittedProjects: 0,
          },
        },
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
   * POST /api/engine/pipeline-state
   * Returns current feature counts by status for pipeline hydration.
   */
  router.post('/pipeline-state', async (req: Request, res: Response) => {
    try {
      const { projectPath } = (req.body ?? {}) as { projectPath?: string };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!featureLoader) {
        res.status(503).json({
          success: false,
          error: 'FeatureLoader not available',
        });
        return;
      }

      // Load all features — count and group by status
      const features = await featureLoader.getAll(projectPath);
      const countsByStatus: Record<string, number> = {
        backlog: 0,
        in_progress: 0,
        review: 0,
        done: 0,
        blocked: 0,
      };
      const featuresByStatus: Record<
        string,
        Array<{
          id: string;
          title: string;
          status: string;
          branchName?: string;
          createdAt?: string;
          complexity?: string;
          lastTraceId?: string;
          costUsd?: number;
        }>
      > = {};

      for (const feature of features) {
        const status = feature.status || 'backlog';
        if (status in countsByStatus) {
          countsByStatus[status]++;
          if (!featuresByStatus[status]) featuresByStatus[status] = [];
          featuresByStatus[status].push({
            id: feature.id,
            title: feature.title || feature.id,
            status,
            branchName: feature.branchName,
            createdAt: feature.createdAt,
            complexity: feature.complexity,
            lastTraceId: feature.lastTraceId,
            costUsd: feature.costUsd,
          });
        }
      }

      res.json({
        success: true,
        countsByStatus,
        featuresByStatus,
        totalFeatures: features.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get pipeline state:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get pipeline state',
      });
    }
  });

  /**
   * POST /api/engine/signal/submit
   * Submit a signal for intake processing (ideas, bugs, feature requests).
   */
  router.post('/signal/submit', async (req: Request, res: Response) => {
    try {
      const { projectPath, content, source, images, files, autoApprove, webResearch } = (req.body ??
        {}) as {
        projectPath?: string;
        content?: string;
        source?: string;
        images?: string[];
        files?: string[];
        autoApprove?: boolean;
        webResearch?: boolean;
      };

      if (!content) {
        res.status(400).json({
          success: false,
          error: 'content is required',
        });
        return;
      }

      // Emit signal:received event for SignalIntakeService to pick up
      signalIntakeService.submitSignal({
        source: source || 'ui:flow-graph',
        content,
        projectPath: projectPath || undefined,
        images,
        files,
        autoApprove,
        webResearch,
      });

      res.json({
        success: true,
        message: 'Signal submitted for processing',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to submit signal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit signal',
      });
    }
  });

  /**
   * POST /api/engine/signal/approve-prd
   * Approve or reject a PRD generated by the PM Agent.
   * Emits ideation:prd-approved so PM Agent triggers decomposition.
   */
  router.post('/signal/approve-prd', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId, decision } = (req.body ?? {}) as {
        projectPath?: string;
        featureId?: string;
        decision?: 'approve' | 'reject';
      };

      if (!projectPath || !featureId || !decision) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and decision (approve|reject) are required',
        });
        return;
      }

      if (!events) {
        res.status(503).json({
          success: false,
          error: 'Event emitter not available',
        });
        return;
      }

      if (decision === 'approve') {
        events.emit('ideation:prd-approved', { projectPath, featureId });
        logger.info(`PRD approved for feature ${featureId}`);
      } else {
        // Reset to idea state so user can re-submit
        if (featureLoader) {
          await featureLoader.update(projectPath, featureId, {
            workItemState: 'idea',
          });
        }

        logger.info(`PRD rejected for feature ${featureId}, reset to idea state`);
      }

      res.json({
        success: true,
        decision,
        featureId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to approve/reject PRD:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process PRD decision',
      });
    }
  });

  return router;
}
