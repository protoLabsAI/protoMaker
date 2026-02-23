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
import type { SignalIntakeService } from '../../services/signal-intake-service.js';
import type { GitWorkflowService } from '../../services/git-workflow-service.js';
import { getAllGraphs, getGraph } from '../../lib/graph-registry.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { PipelineCheckpointService } from '../../services/pipeline-checkpoint-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { GTMAuthorityAgent } from '../../services/authority-agents/gtm-agent.js';
import type { PipelineOrchestrator } from '../../services/pipeline-orchestrator.js';
import type { CeremonyService } from '../../services/ceremony-service.js';
import type { CompletionDetectorService } from '../../services/completion-detector-service.js';
import { getNotesWorkspacePath, ensureNotesDir, secureFs } from '@automaker/platform';
import type { NotesWorkspace, PipelinePhase } from '@automaker/types';
import { PIPELINE_PHASES } from '@automaker/types';

const logger = createLogger('EngineRoutes');

export function createEngineRoutes(
  autoModeService: AutoModeService,
  leadEngineerService: LeadEngineerService | undefined,
  prFeedbackService: PRFeedbackService,
  signalIntakeService: SignalIntakeService,
  gitWorkflowService: GitWorkflowService,
  eventStreamBuffer?: EventStreamBuffer,
  projectService?: ProjectService,
  contentFlowService?: ContentFlowService,
  featureLoader?: FeatureLoader,
  pipelineCheckpointService?: PipelineCheckpointService,
  events?: EventEmitter,
  gtmAgent?: GTMAuthorityAgent,
  pipelineOrchestrator?: PipelineOrchestrator,
  ceremonyService?: CeremonyService,
  completionDetectorService?: CompletionDetectorService
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
        contentPipeline: contentFlowService
          ? {
              ...contentFlowService.getExecutionState(),
              pendingDrafts: gtmAgent ? gtmAgent.getPendingDraftCount() : 0,
            }
          : {
              activeFlows: [],
              recentFlows: [],
              totalActive: 0,
              pendingDrafts: gtmAgent ? gtmAgent.getPendingDraftCount() : 0,
            },
        reflection: {
          ceremonies: ceremonyService?.getStatus() ?? {
            counts: {},
            total: 0,
            lastCeremonyAt: null,
          },
          reflections: ceremonyService?.getReflectionStatus() ?? {
            active: false,
            activeProject: null,
            reflectionCount: 0,
            lastReflection: null,
          },
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
   * POST /api/engine/pipeline-checkpoints
   * Returns active pipeline checkpoints for crash recovery visibility.
   */
  router.post('/pipeline-checkpoints', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId } = (req.body ?? {}) as {
        projectPath?: string;
        featureId?: string;
      };

      if (!pipelineCheckpointService) {
        res.status(503).json({
          success: false,
          error: 'PipelineCheckpointService not available',
        });
        return;
      }

      // If specific feature requested, return just that checkpoint
      if (featureId && projectPath) {
        const checkpoint = await pipelineCheckpointService.load(projectPath, featureId);
        res.json({
          success: true,
          checkpoint: checkpoint ?? null,
        });
        return;
      }

      // List all checkpoints across known project
      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      const checkpoints = await pipelineCheckpointService.listAll(projectPath);
      res.json({
        success: true,
        checkpoints,
        total: checkpoints.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get pipeline checkpoints:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get pipeline checkpoints',
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

        // Also resolve the pipeline gate if the feature is awaiting one at SPEC_REVIEW
        if (pipelineOrchestrator) {
          await pipelineOrchestrator.resolveGate(projectPath, featureId, 'advance', 'user');
        }

        logger.info(`PRD approved for feature ${featureId}`);
      } else {
        // Reset to idea state so user can re-submit
        if (featureLoader) {
          await featureLoader.update(projectPath, featureId, {
            workItemState: 'idea',
          });
        }

        // Also reject the pipeline gate if awaiting
        if (pipelineOrchestrator) {
          await pipelineOrchestrator.resolveGate(projectPath, featureId, 'reject', 'user');
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

  /**
   * GET /api/engine/content/drafts
   * Returns all pending content drafts (survives page refresh).
   */
  router.get('/content/drafts', (_req: Request, res: Response) => {
    const drafts = gtmAgent ? gtmAgent.getPendingDrafts() : [];
    res.json({ success: true, drafts });
  });

  /**
   * POST /api/engine/content/review
   * Approve, reject, or request changes on a GTM content draft.
   * On approve: creates a notes tab with the draft content.
   * On request_changes: re-processes with feedback.
   */
  router.post('/content/review', async (req: Request, res: Response) => {
    try {
      const { projectPath, contentId, decision, editedContent, tabName, feedback } = (req.body ??
        {}) as {
        projectPath?: string;
        contentId?: string;
        decision?: 'approve' | 'reject' | 'request_changes';
        editedContent?: string;
        tabName?: string;
        feedback?: string;
      };

      if (!projectPath || !contentId || !decision) {
        res.status(400).json({
          success: false,
          error:
            'projectPath, contentId, and decision (approve|reject|request_changes) are required',
        });
        return;
      }

      if (!events) {
        res.status(503).json({ success: false, error: 'Event emitter not available' });
        return;
      }

      if (decision === 'request_changes') {
        events.emit('content:changes-requested', {
          projectPath,
          contentId,
          feedback: feedback || '',
          timestamp: new Date().toISOString(),
        });
        res.json({ success: true });
        return;
      }

      if (decision === 'reject') {
        events.emit('content:draft-rejected', {
          projectPath,
          contentId,
          timestamp: new Date().toISOString(),
        });
        res.json({ success: true });
        return;
      }

      // Approve: create a notes tab with the draft content
      const draftContent = editedContent || '';
      const name = tabName || 'Content Draft';

      // Load existing workspace
      const filePath = getNotesWorkspacePath(projectPath);
      let workspace: NotesWorkspace;
      try {
        const raw = await secureFs.readFile(filePath, 'utf-8');
        workspace = JSON.parse(raw as string) as NotesWorkspace;
      } catch {
        // Create default workspace if none exists
        const defaultTabId = crypto.randomUUID();
        const now = Date.now();
        workspace = {
          version: 1,
          activeTabId: defaultTabId,
          tabOrder: [defaultTabId],
          tabs: {
            [defaultTabId]: {
              id: defaultTabId,
              name: 'Notes',
              content: '',
              permissions: { agentRead: true, agentWrite: true },
              metadata: { createdAt: now, updatedAt: now, wordCount: 0, characterCount: 0 },
            },
          },
        };
      }

      // Create new tab with draft content wrapped in a div for TipTap
      const tabId = crypto.randomUUID();
      const now = Date.now();
      const htmlContent = `<div>${draftContent.replace(/\n/g, '<br>')}</div>`;
      const plainText = draftContent.replace(/<[^>]*>/g, '');

      workspace.tabs[tabId] = {
        id: tabId,
        name,
        content: htmlContent,
        permissions: { agentRead: true, agentWrite: true },
        metadata: {
          createdAt: now,
          updatedAt: now,
          wordCount: plainText.trim() ? plainText.trim().split(/\s+/).length : 0,
          characterCount: plainText.length,
        },
      };
      workspace.tabOrder.push(tabId);
      workspace.activeTabId = tabId;

      // Save workspace
      await ensureNotesDir(projectPath);
      await secureFs.writeFile(filePath, JSON.stringify(workspace, null, 2), 'utf-8');

      events.emit('content:draft-approved', {
        projectPath,
        contentId,
        tabId,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Content draft approved and saved to notes tab: ${tabId}`);

      res.json({ success: true, tabId });
    } catch (error) {
      logger.error('Failed to process content review:', error);
      res.status(500).json({ success: false, error: 'Failed to process content review' });
    }
  });

  // ===========================================================================
  // Unified Pipeline Orchestrator Routes
  // ===========================================================================

  /**
   * POST /api/engine/pipeline/status
   * Get pipeline state for a feature.
   */
  router.post('/pipeline/status', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId } = (req.body ?? {}) as {
        projectPath?: string;
        featureId?: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      if (!pipelineOrchestrator) {
        res.status(503).json({
          success: false,
          error: 'PipelineOrchestrator not available',
        });
        return;
      }

      const state = await pipelineOrchestrator.getStatus(projectPath, featureId);
      res.json({
        success: true,
        pipelineState: state,
        activePipelines: pipelineOrchestrator.getActivePipelines().size,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get pipeline status:', error);
      res.status(500).json({ success: false, error: 'Failed to get pipeline status' });
    }
  });

  /**
   * POST /api/engine/pipeline/gate/resolve
   * User resolves a gate (advance or reject).
   */
  router.post('/pipeline/gate/resolve', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId, action } = (req.body ?? {}) as {
        projectPath?: string;
        featureId?: string;
        action?: 'advance' | 'reject';
      };

      if (!projectPath || !featureId || !action) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and action (advance|reject) are required',
        });
        return;
      }

      if (!pipelineOrchestrator) {
        res.status(503).json({
          success: false,
          error: 'PipelineOrchestrator not available',
        });
        return;
      }

      const resolved = await pipelineOrchestrator.resolveGate(
        projectPath,
        featureId,
        action,
        'user'
      );
      if (!resolved) {
        res.status(409).json({
          success: false,
          error: 'Feature is not awaiting a gate resolution',
        });
        return;
      }

      const state = await pipelineOrchestrator.getStatus(projectPath, featureId);
      res.json({
        success: true,
        action,
        pipelineState: state,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to resolve pipeline gate:', error);
      res.status(500).json({ success: false, error: 'Failed to resolve pipeline gate' });
    }
  });

  /**
   * POST /api/engine/pipeline/override
   * Jump a feature to a specific phase manually.
   */
  router.post('/pipeline/override', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId, targetPhase } = (req.body ?? {}) as {
        projectPath?: string;
        featureId?: string;
        targetPhase?: string;
      };

      if (!projectPath || !featureId || !targetPhase) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and targetPhase are required',
        });
        return;
      }

      if (!PIPELINE_PHASES.includes(targetPhase as PipelinePhase)) {
        res.status(400).json({
          success: false,
          error: `Invalid phase: ${targetPhase}. Valid phases: ${PIPELINE_PHASES.join(', ')}`,
        });
        return;
      }

      if (!pipelineOrchestrator) {
        res.status(503).json({
          success: false,
          error: 'PipelineOrchestrator not available',
        });
        return;
      }

      const overridden = await pipelineOrchestrator.overridePhase(
        projectPath,
        featureId,
        targetPhase as PipelinePhase
      );

      if (!overridden) {
        res.status(409).json({
          success: false,
          error: 'Feature has no pipeline state to override',
        });
        return;
      }

      const state = await pipelineOrchestrator.getStatus(projectPath, featureId);
      res.json({
        success: true,
        targetPhase,
        pipelineState: state,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to override pipeline phase:', error);
      res.status(500).json({ success: false, error: 'Failed to override pipeline phase' });
    }
  });

  /**
   * POST /api/engine/pipeline/analytics
   * Returns aggregated pipeline health metrics.
   */
  router.post('/pipeline/analytics', async (_req: Request, res: Response) => {
    try {
      if (!pipelineOrchestrator) {
        res.json({
          success: true,
          activePipelines: 0,
          completedToday: 0,
          avgDurationMinutes: 0,
          gateHoldRate: 0,
          phaseBreakdown: [],
        });
        return;
      }

      const analytics = pipelineOrchestrator.getAnalytics();

      res.json({
        success: true,
        ...analytics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get pipeline analytics:', error);
      res.status(500).json({ success: false, error: 'Failed to get pipeline analytics' });
    }
  });

  return router;
}
