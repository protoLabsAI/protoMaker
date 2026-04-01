/**
 * Lead Engineer Service — Orchestrator
 *
 * Coordinates the production phase lifecycle for projects. Delegates to:
 *   FeatureStateMachine       — per-feature state transitions
 *   WorldStateBuilder         — board snapshot + incremental updates
 *   ActionExecutor            — fast-path rule execution + supervisor
 *   CeremonyOrchestrator      — project completion ceremonies
 *   LeadEngineerSessionStore  — session persistence + checkpoint reconciliation
 */

import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type {
  EventType,
  EventSubscription,
  FeatureStatus,
  LeadEngineerSession,
  LeadRuleAction,
  PipelineResult,
} from '@protolabsai/types';
import { FeatureState } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import { generateCorrelationId } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { ProjectService } from './project-service.js';
import type { ProjectLifecycleService } from './project-lifecycle-service.js';
import type { SettingsService } from './settings-service.js';
import type { MetricsService } from './metrics-service.js';
import type { CodeRabbitResolverService } from './coderabbit-resolver-service.js';
import type { PRFeedbackService } from './pr-feedback-service.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import type { ContextFidelityService } from './context-fidelity-service.js';
import type { KnowledgeStoreService } from './knowledge-store-service.js';
import type { LeadHandoffService } from './lead-handoff-service.js';
import type { FactStoreService } from './fact-store-service.js';
import type { TrajectoryStoreService } from './trajectory-store-service.js';
import type { DeviationRuleService } from './deviation-rule-service.js';
import { DEFAULT_RULES, MECHANICAL_RULES, REASONING_RULES } from './lead-engineer-rules.js';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { resolveModelString } from '@protolabsai/model-resolver';
import { FeatureStateMachine } from './lead-engineer-state-machine.js';
import { WorldStateBuilder } from './lead-engineer-world-state.js';
import { ActionExecutor } from './lead-engineer-action-executor.js';
import { CeremonyOrchestrator } from './lead-engineer-ceremonies.js';
import { LeadEngineerSessionStore } from './lead-engineer-session-store.js';
import type {
  FeatureProcessingState,
  StateContext,
  IPlanReviewService,
} from './lead-engineer-types.js';
import type { ProcessorRegistry } from './processor-registry.js';
import type { WorkflowLoader } from './workflow-loader.js';
import type { HITLFormService } from './hitl-form-service.js';
import type { AuthorityService } from './authority-service.js';
import type { SchedulerService } from './scheduler-service.js';

export type { FeatureProcessingState, StateContext };
export type { ProcessorServiceContext } from './lead-engineer-types.js';
export { FeatureStateMachine } from './lead-engineer-state-machine.js';

// ────────────────────────── Bidirectional Integration Types ──────────────────────────

/**
 * Execution status summary that LE exposes to the PM layer.
 * Defined here so LeadEngineerService can produce it without importing from PM.
 */
export interface LEExecutionStatusSummary {
  activeProjectCount: number;
  activeFeaturesCount: number;
  projectStatuses: Array<{
    projectPath: string;
    projectSlug: string;
    flowState: string;
  }>;
}

/**
 * Next assignable phase as returned by the PM layer.
 * Defined here so LeadEngineerService can consume it without importing from PM.
 */
export interface PMNextAssignablePhase {
  milestoneSlug: string;
  milestoneTitle: string;
  remainingPhases: number;
  dueAt?: string;
}

/**
 * Interface the PM layer must implement to provide next-phase data to LE.
 * Injected via setPMWorldStateProvider() to avoid circular dependencies.
 */
export interface IPMWorldStateProvider {
  getNextAssignablePhase(): PMNextAssignablePhase | null;
}

const execAsync = promisify(exec);
const logger = createLogger('LeadEngineerService');
const WORLD_STATE_REFRESH_MS = 5 * 60 * 1000;
const MAX_RULE_LOG_ENTRIES = 200;
const SUPERVISOR_CHECK_MS = 30 * 1000;
const PR_MERGE_POLL_MS = 2.5 * 60 * 1000;

/** Maximum cost cap for a single LLM reasoning invocation */
const MAX_REASONING_COST_USD = 0.5;
/** Timeout for LLM reasoning path in milliseconds */
const REASONING_TIMEOUT_MS = 60_000;
// Haiku 4.5 pricing: $0.25/1M input + $1.25/1M output tokens (~4 chars/token avg)
const HAIKU_INPUT_USD_PER_CHAR = 0.25 / (1_000_000 * 4);
const HAIKU_OUTPUT_USD_PER_CHAR = 1.25 / (1_000_000 * 4);

export class LeadEngineerService {
  private sessions = new Map<string, LeadEngineerSession>();
  private subscriptions: EventSubscription[] = [];
  private refreshIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private supervisorIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private prMergeIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly resumeIntervals = new Map<string, NodeJS.Timeout>();
  private activeFeatures = new Set<string>();

  private schedulerService?: SchedulerService;

  private discordBotService?: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  };
  private codeRabbitResolver?: CodeRabbitResolverService;
  private prFeedbackService?: PRFeedbackService;
  private checkpointService?: PipelineCheckpointService;
  /** Features suspended in REVIEW/MERGE awaiting external re-trigger */
  private readonly pendingResumes = new Map<string, { projectPath: string; featureId: string }>();
  private contextFidelityService?: ContextFidelityService;
  private knowledgeStoreService?: KnowledgeStoreService;
  private handoffService?: LeadHandoffService;
  private factStoreService?: FactStoreService;
  private trajectoryStoreService?: TrajectoryStoreService;
  private deviationRuleService?: DeviationRuleService;
  private antagonisticReviewService?: IPlanReviewService;
  private hitlFormService?: HITLFormService;
  private authorityService?: AuthorityService;
  private processorRegistry?: ProcessorRegistry;
  private workflowLoader?: WorkflowLoader;
  /** Per-project workflow settings cache — populated when a session starts */
  private workflowSettingsCache = new Map<string, import('@protolabsai/types').WorkflowSettings>();

  private worldStateBuilder: WorldStateBuilder;
  private sessionStore: LeadEngineerSessionStore;
  private pmWorldStateProvider?: IPMWorldStateProvider;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private projectService: ProjectService,
    private projectLifecycleService: ProjectLifecycleService,
    private settingsService: SettingsService,
    private metricsService: MetricsService,
    private dataDir: string = process.env.DATA_DIR ?? './data'
  ) {
    this.worldStateBuilder = new WorldStateBuilder({
      featureLoader,
      autoModeService,
      projectService,
      metricsService,
      settingsService,
    });
    this.sessionStore = new LeadEngineerSessionStore({
      featureLoader,
      settingsService,
      dataDir: this.dataDir,
    });
  }

  setCheckpointService(s: PipelineCheckpointService): void {
    this.checkpointService = s;
  }
  setContextFidelityService(s: ContextFidelityService): void {
    this.contextFidelityService = s;
  }
  setKnowledgeStoreService(s: KnowledgeStoreService): void {
    this.knowledgeStoreService = s;
  }
  setDiscordBot(b: { sendToChannel(c: string, m: string): Promise<boolean> }): void {
    this.discordBotService = b;
  }
  setCodeRabbitResolver(r: CodeRabbitResolverService): void {
    this.codeRabbitResolver = r;
  }
  setPRFeedbackService(s: PRFeedbackService): void {
    this.prFeedbackService = s;
  }
  setHandoffService(s: LeadHandoffService): void {
    this.handoffService = s;
  }
  setFactStoreService(s: FactStoreService): void {
    this.factStoreService = s;
  }
  setTrajectoryStoreService(s: TrajectoryStoreService): void {
    this.trajectoryStoreService = s;
  }
  setDeviationRuleService(s: DeviationRuleService): void {
    this.deviationRuleService = s;
  }
  setAntagonisticReviewService(s: IPlanReviewService): void {
    this.antagonisticReviewService = s;
  }
  setHITLFormService(s: HITLFormService): void {
    this.hitlFormService = s;
  }
  setAuthorityService(s: AuthorityService): void {
    this.authorityService = s;
  }
  setSchedulerService(s: SchedulerService): void {
    this.schedulerService = s;
  }
  setProcessorRegistry(r: ProcessorRegistry): void {
    this.processorRegistry = r;
  }
  setWorkflowLoader(l: WorkflowLoader): void {
    this.workflowLoader = l;
  }

  // ────────────────────────── Bidirectional Integration ──────────────────────────

  /**
   * Inject a PM world-state provider so LE can query PM for next-phase assignments.
   * Use this pattern (vs. direct import) to avoid circular module dependencies.
   */
  setPMWorldStateProvider(provider: IPMWorldStateProvider): void {
    this.pmWorldStateProvider = provider;
  }

  /**
   * Query the PM layer for the next phase LE should work on.
   * Returns null when no provider has been injected or PM has no pending phases.
   */
  queryPMNextAssignment(): PMNextAssignablePhase | null {
    return this.pmWorldStateProvider?.getNextAssignablePhase() ?? null;
  }

  /**
   * Return a concise snapshot of LE's current execution state.
   * Called by the PM layer via ILeadEngineerStatusProvider.
   */
  getExecutionStatusSummary(): LEExecutionStatusSummary {
    const sessions = this.getAllSessions();
    return {
      activeProjectCount: sessions.filter((s) => s.flowState === 'running').length,
      activeFeaturesCount: this.activeFeatures.size,
      projectStatuses: sessions.map((s) => ({
        projectPath: s.projectPath,
        projectSlug: s.projectSlug,
        flowState: s.flowState,
      })),
    };
  }

  /**
   * Returns true when the Lead Engineer has an active (running) session for the given project.
   * Used by EM Agent to skip execution when Lead Engineer owns the lifecycle.
   */
  isActive(projectPath: string): boolean {
    const session = this.sessions.get(projectPath);
    return session?.flowState === 'running';
  }

  async initialize(): Promise<void> {
    this.subscriptions.push(
      this.events.on('project:lifecycle:launched', (data) => {
        const p = data as { projectPath?: string; projectSlug?: string } | null;
        if (p?.projectPath && p?.projectSlug) {
          this.start(p.projectPath, p.projectSlug).catch((err) =>
            logger.error(`Auto-start failed for ${p.projectSlug}:`, err)
          );
        }
      }),
      this.events.on('lead-engineer:project-completing-requested', (data) => {
        if (data?.projectPath) {
          const session = this.sessions.get(data.projectPath);
          if (session) void this.handleProjectCompleting(session);
        }
      }),
      this.events.subscribe((type: EventType, payload: unknown) => {
        if (
          type !== 'project:lifecycle:launched' &&
          type !== 'lead-engineer:project-completing-requested' &&
          type !== 'lead-engineer:rule-evaluated'
        ) {
          this.onEvent(type, payload);
        }
      }),
      this.events.on('gate:tuning-signal' as EventType, (data) => {
        this.persistGateTuningSignal(
          data as {
            projectPath: string;
            projectSlug: string;
            milestoneSlug?: string;
            retroSource: string;
            signal: string;
            originalItem: string;
            timestamp: string;
          }
        );
      })
    );
    await this.sessionStore.restore(async (projectPath, projectSlug, maxConcurrency) => {
      await this.start(projectPath, projectSlug, { maxConcurrency });
    });
    logger.info('LeadEngineerService initialized');
  }

  async reconcileCheckpoints(projectPath: string): Promise<{ deleted: string[] }> {
    if (!this.checkpointService) return { deleted: [] };
    return this.sessionStore.reconcileCheckpoints(projectPath, this.checkpointService);
  }

  destroy(): void {
    for (const sub of this.subscriptions) sub.unsubscribe();
    this.subscriptions = [];
    for (const [projectPath] of this.sessions) this.clearIntervals(projectPath);
    this.sessions.clear();
    logger.info('LeadEngineerService destroyed');
  }

  async start(
    projectPath: string,
    projectSlug: string,
    opts?: { maxConcurrency?: number }
  ): Promise<LeadEngineerSession> {
    if (this.sessions.has(projectPath)) {
      logger.warn(`Already managing project at ${projectPath}, returning existing session`);
      return this.sessions.get(projectPath)!;
    }

    logger.info(`Starting Lead Engineer for ${projectSlug} at ${projectPath}`);
    const worldState = await this.worldStateBuilder.build(
      projectPath,
      projectSlug,
      opts?.maxConcurrency
    );
    const session: LeadEngineerSession = {
      projectPath,
      projectSlug,
      flowState: 'running',
      worldState,
      startedAt: new Date().toISOString(),
      ruleLog: [],
      actionsTaken: 0,
    };
    this.sessions.set(projectPath, session);

    if (!worldState.autoModeRunning && (worldState.boardCounts['backlog'] || 0) > 0) {
      await this.projectLifecycleService
        .launch(projectPath, projectSlug)
        .catch((err) => logger.warn(`Failed to start auto-mode for ${projectSlug}:`, err));
    }

    const refreshHandler = async () => {
      const s = this.sessions.get(projectPath);
      if (!s || s.flowState !== 'running') return;
      try {
        s.worldState = await this.worldStateBuilder.build(
          projectPath,
          projectSlug,
          s.worldState.maxConcurrency
        );
        this.getActionExecutor(undefined, projectPath).evaluateAndExecute(
          s,
          MECHANICAL_RULES,
          'lead-engineer:rule-evaluated',
          {},
          MAX_RULE_LOG_ENTRIES
        );
      } catch (err) {
        logger.error(`WorldState refresh failed for ${projectSlug}:`, err);
      }
    };

    if (this.schedulerService) {
      this.schedulerService.registerInterval(
        `lead-engineer:${projectPath}:refresh`,
        `Lead Engineer World State Refresh (${projectSlug})`,
        WORLD_STATE_REFRESH_MS,
        refreshHandler
      );
    } else {
      this.refreshIntervals.set(projectPath, setInterval(refreshHandler, WORLD_STATE_REFRESH_MS));
    }

    const workflowSettings = await getWorkflowSettings(
      projectPath,
      this.settingsService,
      '[LeadEngineer]'
    );
    this.workflowSettingsCache.set(projectPath, workflowSettings);

    if (workflowSettings.pipeline.supervisorEnabled) {
      const executor = this.getActionExecutor(workflowSettings);
      const supervisorHandler = () => {
        const s = this.sessions.get(projectPath);
        if (s?.flowState === 'running') executor.supervisorCheck(s, workflowSettings);
      };

      if (this.schedulerService) {
        this.schedulerService.registerInterval(
          `lead-engineer:${projectPath}:supervisor`,
          `Lead Engineer Supervisor (${projectSlug})`,
          SUPERVISOR_CHECK_MS,
          supervisorHandler
        );
      } else {
        this.supervisorIntervals.set(
          projectPath,
          setInterval(supervisorHandler, SUPERVISOR_CHECK_MS)
        );
      }
    }

    const prMergeHandler = () => {
      const s = this.sessions.get(projectPath);
      if (s?.flowState === 'running') {
        this.checkMergedPRs(projectPath).catch((err) =>
          logger.error(`PR merge poll failed for ${projectSlug}:`, err)
        );
      }
    };

    if (this.schedulerService) {
      this.schedulerService.registerInterval(
        `lead-engineer:${projectPath}:pr-merge-poll`,
        `Lead Engineer PR Merge Poll (${projectSlug})`,
        PR_MERGE_POLL_MS,
        prMergeHandler
      );
    } else {
      this.prMergeIntervals.set(projectPath, setInterval(prMergeHandler, PR_MERGE_POLL_MS));
    }

    const resumeSuspendedHandler = async () => {
      const s = this.sessions.get(projectPath);
      if (!s || s.flowState !== 'running') return;
      // Collect items to process (snapshot to avoid mutation during iteration)
      const toResume: Array<{ projectPath: string; featureId: string }> = [];
      for (const [fid, info] of this.pendingResumes.entries()) {
        if (info.projectPath !== projectPath) continue;
        if (this.activeFeatures.has(fid)) continue;
        toResume.push(info);
        this.pendingResumes.delete(fid);
      }
      for (const { featureId: fid } of toResume) {
        logger.info(`[LeadEngineer] Resuming suspended/checkpointed feature ${fid}`);
        void this.process(projectPath, fid).catch((err) =>
          logger.error(`[LeadEngineer] Resume failed for ${fid}:`, err)
        );
      }
    };

    const RESUME_POLL_MS = 60_000; // 1-minute resume poll
    if (this.schedulerService) {
      this.schedulerService.registerInterval(
        `lead-engineer:${projectPath}:resume-suspended`,
        `Lead Engineer Suspended Feature Resume (${projectSlug})`,
        RESUME_POLL_MS,
        resumeSuspendedHandler
      );
    } else {
      this.resumeIntervals.set(projectPath, setInterval(resumeSuspendedHandler, RESUME_POLL_MS));
    }

    await this.sessionStore.save(session);

    // Recover any checkpointed features from a previous server run.
    // On restart, features in REVIEW/MERGE (suspended) or mid-processing need re-queuing.
    if (this.checkpointService) {
      try {
        const checkpoints = await this.checkpointService.listAll(projectPath);
        for (const cp of checkpoints) {
          if (!this.activeFeatures.has(cp.featureId)) {
            this.pendingResumes.set(cp.featureId, { projectPath, featureId: cp.featureId });
          }
        }
        if (checkpoints.length > 0) {
          logger.info(
            `[LeadEngineer] Scheduled crash-recovery resume for ${checkpoints.length} checkpointed feature(s) in ${projectPath}`
          );
        }
      } catch (err) {
        logger.warn(`[LeadEngineer] Failed to scan checkpoints for crash recovery:`, err);
      }
    }

    this.events.emit('lead-engineer:started', { projectPath, projectSlug });
    logger.info(`Lead Engineer started for ${projectSlug}`);
    return session;
  }

  async stop(projectPath: string): Promise<void> {
    const session = this.sessions.get(projectPath);
    if (!session) {
      logger.warn(`No session found for ${projectPath}`);
      return;
    }
    this.clearIntervals(projectPath);
    this.workflowSettingsCache.delete(projectPath);
    session.flowState = 'stopped';
    session.stoppedAt = new Date().toISOString();
    this.sessions.delete(projectPath);
    await this.sessionStore.remove(projectPath);
    this.events.emit('lead-engineer:stopped', { projectPath, projectSlug: session.projectSlug });
    logger.info(`Lead Engineer stopped for ${session.projectSlug}`);
  }

  getSession(projectPath: string): LeadEngineerSession | undefined {
    return this.sessions.get(projectPath);
  }
  getAllSessions(): LeadEngineerSession[] {
    return Array.from(this.sessions.values());
  }
  isManaged(projectPath: string): boolean {
    return this.sessions.has(projectPath);
  }
  getManagedProjectPaths(): string[] {
    return Array.from(this.sessions.keys());
  }
  isFeatureActive(featureId: string): boolean {
    return this.activeFeatures.has(featureId);
  }

  async process(projectPath: string, featureId: string): Promise<PipelineResult> {
    logger.info(`[LeadEngineer] Processing feature ${featureId}`, {
      projectPath,
    });

    // Inherit correlation context from the triggering event, or start a new chain.
    const existingCtx = this.events.getCorrelationContext();
    const correlationId = existingCtx?.correlationId ?? generateCorrelationId();
    this.events.setCorrelationContext({
      correlationId,
      causationId: existingCtx?.causationId,
      source: 'lead-engineer-service',
    });

    this.activeFeatures.add(featureId);
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.warn(
          `[LeadEngineer] Feature ${featureId} no longer exists — removing from resume queue`
        );
        this.pendingResumes.delete(featureId);
        this.activeFeatures.delete(featureId);
        return { outcome: 'completed', finalState: FeatureState.DONE, failureCount: 0 };
      }

      // Guard: skip features already in terminal states
      const terminalStatuses = new Set(['done', 'completed', 'verified']);
      if (feature.status && terminalStatuses.has(feature.status)) {
        logger.info(
          `[LeadEngineer] Skipping feature ${featureId} — already in terminal status "${feature.status}"`
        );
        this.activeFeatures.delete(featureId);
        return {
          outcome: 'completed',
          finalState: FeatureState.DONE,
          failureCount: 0,
        };
      }

      let resumeFromCheckpoint:
        | { state: FeatureProcessingState; restoredContext?: Partial<StateContext> }
        | undefined;

      if (this.checkpointService) {
        const checkpoint = await this.checkpointService.load(projectPath, featureId);
        if (checkpoint) {
          logger.info(
            `[LeadEngineer] Resuming ${featureId} from checkpoint ${checkpoint.currentState}`
          );
          const restoredContext = this.checkpointService.restoreContext(checkpoint);
          // Stale context trap fix: prefer live feature data over checkpointed values.
          // prNumber: use board value if available (checkpoint may be stale after PR recreation).
          if (feature.prNumber && !restoredContext.prNumber) {
            restoredContext.prNumber = feature.prNumber;
          }
          // ciStatus: clear 'pending' on resume — REVIEW processor will re-check live status.
          if (restoredContext.ciStatus === 'pending') {
            restoredContext.ciStatus = undefined;
          }
          resumeFromCheckpoint = {
            state: checkpoint.currentState as FeatureProcessingState,
            restoredContext,
          };
        }
      }

      const serviceContext = {
        events: this.events,
        featureLoader: this.featureLoader,
        autoModeService: this.autoModeService,
        prFeedbackService: this.prFeedbackService,
        checkpointService: this.checkpointService,
        contextFidelityService: this.contextFidelityService,
        knowledgeStoreService: this.knowledgeStoreService,
        settingsService: this.settingsService,
        factStoreService: this.factStoreService,
        leadHandoffService: this.handoffService,
        antagonisticReviewService: this.antagonisticReviewService,
        hitlFormService: this.hitlFormService,
        trajectoryStoreService: this.trajectoryStoreService,
        deviationRuleService: this.deviationRuleService,
      };

      const workflowSettings = await getWorkflowSettings(
        projectPath,
        this.settingsService,
        '[LeadEngineer]'
      );

      // Resolve workflow definition for this feature
      const workflowDef = this.workflowLoader
        ? await this.workflowLoader.resolveForFeature(projectPath, feature)
        : undefined;

      // Apply workflow execution settings to the feature so downstream services
      // (ExecuteProcessor, git-workflow-service, execution-service) respect them.
      if (workflowDef && workflowDef.name !== 'standard') {
        // Derive executionMode from workflow's useWorktrees setting
        if (!workflowDef.execution.useWorktrees) {
          feature.executionMode = 'read-only';
        }

        // Merge workflow gitWorkflow overrides into feature-level git settings
        if (workflowDef.execution.gitWorkflow) {
          feature.gitWorkflow = {
            ...feature.gitWorkflow,
            ...workflowDef.execution.gitWorkflow,
          };
        }

        // Persist so execution-service and git-workflow-service pick them up
        await this.featureLoader.update(projectPath, featureId, {
          executionMode: feature.executionMode,
          gitWorkflow: feature.gitWorkflow,
        });
      }

      // Workflows that skip PR-centric phases (REVIEW, MERGE) don't need goal gates
      const hasPRPhases = workflowDef
        ? workflowDef.phases.some((p) => p.enabled && (p.state === 'REVIEW' || p.state === 'MERGE'))
        : true;

      const stateMachine = new FeatureStateMachine(serviceContext, {
        checkpointService: workflowSettings.pipeline.checkpointEnabled
          ? this.checkpointService
          : undefined,
        events: this.events,
        goalGatesEnabled: hasPRPhases ? workflowSettings.pipeline.goalGatesEnabled : false,
        workflow: workflowDef,
        processorRegistry: this.processorRegistry,
      });

      if (workflowDef && workflowDef.name !== 'standard') {
        logger.info(`[LeadEngineer] Feature ${featureId} using workflow: ${workflowDef.name}`, {
          enabledPhases: workflowDef.phases.filter((p) => p.enabled).map((p) => p.state),
        });
      }

      // Emit pipeline:phase-sync after each LE state transition so PipelineOrchestrator
      // can keep the 9-phase model in sync with the Lead Engineer's actual progress.
      const phaseSyncStates = new Set(['REVIEW', 'MERGE', 'DEPLOY', 'DONE']);
      const unsubPipelineSync = this.events.subscribe((type: EventType, payload: unknown) => {
        if (type !== ('pipeline:state-entered' as EventType)) return;
        const p = payload as { featureId?: string; state?: string; fromState?: string } | null;
        if (!p || p.featureId !== featureId || !p.state || !phaseSyncStates.has(p.state)) return;
        this.events.emit('pipeline:phase-sync' as EventType, {
          featureId,
          projectPath,
          fromState: p.fromState,
          toState: p.state,
          timestamp: new Date().toISOString(),
        });
      });

      let result: Awaited<ReturnType<typeof stateMachine.processFeature>>;
      try {
        result = await stateMachine.processFeature(feature, projectPath, resumeFromCheckpoint);
      } finally {
        unsubPipelineSync();
      }

      const outcome: PipelineResult['outcome'] =
        result.finalState === 'DONE'
          ? 'completed'
          : result.finalState === 'ESCALATE'
            ? 'escalated'
            : 'blocked';

      const pipelineResult: PipelineResult = {
        outcome,
        finalState: result.finalState as unknown as FeatureState,
        failureCount: result.context.retryCount,
      };

      // Track suspended features (REVIEW/MERGE) for external re-trigger.
      const SUSPEND_STATES = new Set<string>(['REVIEW', 'MERGE']);
      if (SUSPEND_STATES.has(result.finalState)) {
        logger.info(
          `[LeadEngineer] Feature ${featureId} suspended in ${result.finalState} — queued for resume`
        );
        this.pendingResumes.set(featureId, { projectPath, featureId });
      }

      logger.info(`[LeadEngineer] Feature processing completed`, {
        featureId,
        finalState: result.finalState,
        outcome,
        escalated: result.finalState === 'ESCALATE',
      });
      this.events.emit('lead-engineer:feature-processed' as EventType, {
        projectPath,
        featureId,
        finalState: result.finalState,
        outcome,
        success: result.finalState !== 'ESCALATE',
      });

      // Apply workflow terminal status: move feature to 'done' when the workflow says so.
      // Without this, features whose workflows skip REVIEW/MERGE/DEPLOY would stay
      // in their last status instead of transitioning to done.
      if (result.finalState === 'DONE' && workflowDef?.execution.terminalStatus === 'done') {
        const currentFeature = await this.featureLoader.get(projectPath, featureId);
        if (currentFeature && currentFeature.status !== 'done') {
          await this.featureLoader.update(projectPath, featureId, {
            status: 'done',
            completedAt: new Date().toISOString(),
            statusChangeReason: `Workflow '${workflowDef.name}' completed — terminal status is done`,
          });
          logger.info(
            `[LeadEngineer] Feature ${featureId} moved to done per workflow terminal status`
          );
        }
      }

      // Index engineering learnings when feature completes via state machine (DONE)
      if (result.finalState === 'DONE' && this.knowledgeStoreService) {
        this.knowledgeStoreService
          .ingestFeatureCompletionLearnings(projectPath, featureId)
          .catch((err) =>
            logger.warn(
              `[LeadEngineer] Failed to ingest completion learnings for ${featureId} (non-fatal):`,
              err
            )
          );
      }

      return pipelineResult;
    } catch (error: unknown) {
      logger.error(`[LeadEngineer] Feature processing failed`, {
        featureId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.activeFeatures.delete(featureId);
      this.events.clearCorrelationContext();
    }
  }

  // ────────────────────────── Private ──────────────────────────

  private getActionExecutor(
    workflowSettings?: import('@protolabsai/types').WorkflowSettings,
    projectPath?: string
  ): ActionExecutor {
    const resolvedSettings =
      workflowSettings ?? (projectPath ? this.workflowSettingsCache.get(projectPath) : undefined);
    return new ActionExecutor({
      events: this.events,
      featureLoader: this.featureLoader,
      autoModeService: this.autoModeService,
      codeRabbitResolver: this.codeRabbitResolver,
      discordBotService: this.discordBotService,
      authorityService: this.authorityService,
      workflowSettings: resolvedSettings,
    });
  }

  private clearIntervals(projectPath: string): void {
    if (this.schedulerService) {
      this.schedulerService.unregisterInterval(`lead-engineer:${projectPath}:refresh`);
      this.schedulerService.unregisterInterval(`lead-engineer:${projectPath}:supervisor`);
      this.schedulerService.unregisterInterval(`lead-engineer:${projectPath}:pr-merge-poll`);
      this.schedulerService.unregisterInterval(`lead-engineer:${projectPath}:resume-suspended`);
    } else {
      const r = this.refreshIntervals.get(projectPath);
      if (r) {
        clearInterval(r);
        this.refreshIntervals.delete(projectPath);
      }
      const s = this.supervisorIntervals.get(projectPath);
      if (s) {
        clearInterval(s);
        this.supervisorIntervals.delete(projectPath);
      }
      const p = this.prMergeIntervals.get(projectPath);
      if (p) {
        clearInterval(p);
        this.prMergeIntervals.delete(projectPath);
      }
      const resumeInterval = this.resumeIntervals.get(projectPath);
      if (resumeInterval) {
        clearInterval(resumeInterval);
        this.resumeIntervals.delete(projectPath);
      }
    }
  }

  /** @internal exported for testing */
  async checkMergedPRs(projectPath: string): Promise<void> {
    const session = this.sessions.get(projectPath);
    if (!session || session.flowState !== 'running') return;

    let features: Awaited<ReturnType<typeof this.featureLoader.getAll>>;
    try {
      features = await this.featureLoader.getAll(projectPath);
    } catch (err) {
      logger.error(`[PRMergePoller] Failed to load features for ${projectPath}:`, err);
      return;
    }

    const reviewFeaturesWithPR = features.filter(
      (f) => f.status === 'review' && f.prNumber != null
    );

    if (reviewFeaturesWithPR.length === 0) return;

    logger.debug(
      `[PRMergePoller] Checking ${reviewFeaturesWithPR.length} review feature(s) for merged PRs in ${session.projectSlug}`
    );

    for (const feature of reviewFeaturesWithPR) {
      try {
        const { stdout } = await execAsync(`gh pr view ${feature.prNumber} --json state,mergedAt`, {
          cwd: projectPath,
          timeout: 15000,
        });
        const prData = JSON.parse(stdout.trim()) as { state: string; mergedAt?: string | null };

        if (prData.state !== 'MERGED') continue;

        // Skip if already handled (e.g., by ReviewProcessor or MergeProcessor)
        const currentFeature = await this.featureLoader.get(projectPath, feature.id);
        if (currentFeature?.status === 'done') {
          logger.debug(
            `[PRMergePoller] Feature "${feature.id}" already done, skipping duplicate processing`
          );
          continue;
        }

        const prMergedAt = prData.mergedAt ?? new Date().toISOString();

        logger.info(
          `[PRMergePoller] PR #${feature.prNumber} for feature "${feature.id}" is merged — transitioning to done`
        );

        await this.featureLoader.update(projectPath, feature.id, {
          status: 'done',
          prMergedAt,
        });

        this.events.emit('feature:pr-merged' as EventType, {
          featureId: feature.id,
          featureTitle: feature.title,
          prNumber: feature.prNumber,
          projectPath,
        });

        // Index engineering learnings when feature reaches DONE via PR merge
        if (this.knowledgeStoreService) {
          this.knowledgeStoreService
            .ingestFeatureCompletionLearnings(projectPath, feature.id)
            .catch((err) =>
              logger.warn(
                `[PRMergePoller] Failed to ingest learnings for ${feature.id} (non-fatal):`,
                err
              )
            );
        }
      } catch (err) {
        logger.warn(
          `[PRMergePoller] Failed to check PR #${feature.prNumber} for feature "${feature.id}" (non-fatal):`,
          err
        );
      }
    }
  }

  private async onEvent(type: EventType, payload: unknown): Promise<void> {
    const p = payload as Record<string, unknown> | null;
    const nested = p?.payload as Record<string, unknown> | null;
    const ctx = p?.context as Record<string, unknown> | undefined;
    const projectPath = (p?.projectPath ?? nested?.projectPath ?? ctx?.projectPath) as
      | string
      | undefined;

    if (projectPath) {
      const session = this.sessions.get(projectPath);
      if (session?.flowState === 'running') {
        this.worldStateBuilder.updateFromEvent(session.worldState, type, payload);
        this.getActionExecutor(undefined, projectPath).evaluateAndExecute(
          session,
          MECHANICAL_RULES,
          type,
          payload,
          MAX_RULE_LOG_ENTRIES
        );
        // Invoke agent reasoning path for signals that reasoning rules would have handled
        if (REASONING_RULES.some((r) => r.triggers.includes(type))) {
          void this.invokeReasoningPath(session, type, payload);
        }
      }
      return;
    }

    const featureId = (p?.featureId ?? nested?.featureId ?? ctx?.featureId) as string | undefined;
    if (featureId) {
      for (const session of this.sessions.values()) {
        if (session.flowState !== 'running') continue;
        if (!session.worldState.features[featureId]) {
          try {
            const feature = await this.featureLoader.get(session.projectPath, featureId);
            if (feature) {
              session.worldState.features[featureId] =
                this.worldStateBuilder.featureToSnapshot(feature);
            } else {
              continue;
            }
          } catch {
            continue;
          }
        }
        this.worldStateBuilder.updateFromEvent(session.worldState, type, payload);
        this.getActionExecutor(undefined, session.projectPath).evaluateAndExecute(
          session,
          MECHANICAL_RULES,
          type,
          payload,
          MAX_RULE_LOG_ENTRIES
        );
        // Invoke agent reasoning path for signals that reasoning rules would have handled
        if (REASONING_RULES.some((r) => r.triggers.includes(type))) {
          void this.invokeReasoningPath(session, type, payload);
        }
        return;
      }
    }
  }

  private persistGateTuningSignal(signal: {
    projectPath: string;
    projectSlug: string;
    milestoneSlug?: string;
    retroSource: string;
    signal: string;
    originalItem: string;
    timestamp: string;
  }): void {
    const logPath = path.join(signal.projectPath, '.automaker', 'gate-tuning-log.json');
    logger.info(
      `LeadEngineerService: gate:tuning-signal received for ${signal.retroSource}: ${signal.signal}`
    );

    void (async () => {
      try {
        await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
        let existing: unknown[] = [];
        try {
          const raw = await fs.promises.readFile(logPath, 'utf-8');
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) existing = parsed;
        } catch {
          // File does not exist yet — start with empty array
        }
        existing.push(signal);
        await fs.promises.writeFile(logPath, JSON.stringify(existing, null, 2), 'utf-8');
        logger.info(
          `LeadEngineerService: persisted gate:tuning-signal to ${logPath} (total: ${existing.length})`
        );
      } catch (err) {
        logger.warn(
          `LeadEngineerService: failed to persist gate:tuning-signal: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })();
  }

  private async handleProjectCompleting(session: LeadEngineerSession): Promise<void> {
    await new CeremonyOrchestrator({
      events: this.events,
      featureLoader: this.featureLoader,
      worldStateBuilder: this.worldStateBuilder,
    }).handleProjectCompleting(
      session,
      (projectPath) => this.clearIntervals(projectPath),
      async (projectPath) => {
        this.sessions.delete(projectPath);
        await this.sessionStore.remove(projectPath);
      }
    );
  }

  /**
   * Emit a reasoning path escalation signal.
   * Called when reasoning path fails, times out, or exceeds cost cap.
   */
  private emitReasoningEscalation(
    session: LeadEngineerSession,
    eventType: string,
    featureId: string | undefined,
    reason: string,
    details: string
  ): void {
    this.events.emit('escalation:signal-received' as EventType, {
      source: 'lead_engineer_reasoning',
      severity: 'medium',
      type: reason,
      context: {
        eventType,
        featureId,
        projectPath: session.projectPath,
        reason: details,
      },
      deduplicationKey: `reasoning_${reason}_${featureId ?? session.projectPath}_${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Agent reasoning path: invoked when no mechanical rule matches an ambiguous signal.
   *
   * Packages signal context (event type, feature state, last 3 trajectory reflections,
   * statusChangeReason history) and invokes LLM to decide next action.
   *
   * Guards:
   * - Context validation: escalates immediately if featureId is absent
   * - Cost cap: aborts if estimated prompt cost exceeds $0.50
   * - Timeout: aborts if LLM call exceeds 60 seconds
   * - Retry: retries once on malformed LLM response; escalates if still failing
   */
  private async invokeReasoningPath(
    session: LeadEngineerSession,
    eventType: string,
    payload: unknown
  ): Promise<void> {
    const p = payload as Record<string, unknown> | null;
    const featureId = p?.featureId as string | undefined;

    // Guard: escalate immediately if signal context is missing required fields
    if (!featureId) {
      logger.warn('[Reasoning] Signal context incomplete: missing featureId — escalating', {
        eventType,
      });
      this.emitReasoningEscalation(
        session,
        eventType,
        undefined,
        'context_incomplete',
        'Signal context missing featureId — cannot invoke reasoning path'
      );
      return;
    }

    const feature = session.worldState.features[featureId];

    // Load last 3 trajectory reflections for context
    const trajectoryReflections: string[] = [];
    if (this.trajectoryStoreService) {
      try {
        const trajectories = await this.trajectoryStoreService.loadTrajectories(
          session.projectPath,
          featureId
        );
        for (const t of trajectories.slice(-3)) {
          const summary = t.escalationReason
            ? `Attempt ${t.attemptNumber} (escalated): ${t.escalationReason}`
            : `Attempt ${t.attemptNumber}: ${t.executionSummary.slice(0, 200)}`;
          trajectoryReflections.push(summary);
        }
      } catch {
        // Non-fatal: proceed without trajectory context
      }
    }

    const reasoningContext = {
      eventType,
      payload,
      featureState: feature ?? null,
      statusChangeReason: feature?.statusChangeReason,
      worldStateSummary: {
        boardCounts: session.worldState.boardCounts,
        agentCount: session.worldState.agents.length,
        openPRCount: session.worldState.openPRs.length,
        errorBudgetExhausted: session.worldState.errorBudgetExhausted ?? false,
      },
      trajectoryReflections,
      recentRuleLog: session.ruleLog.slice(-5).map((e) => ({
        timestamp: e.timestamp,
        ruleName: e.ruleName,
        eventType: e.eventType,
        actionCount: e.actions.length,
      })),
    };

    const prompt = buildReasoningPrompt(reasoningContext);

    // Pre-call cost guard: abort if prompt is too large to stay under the cost cap
    const estimatedInputCostUsd = prompt.length * HAIKU_INPUT_USD_PER_CHAR;
    if (estimatedInputCostUsd > MAX_REASONING_COST_USD) {
      logger.warn(
        `[Reasoning] Cost cap: prompt too large — estimated $${estimatedInputCostUsd.toFixed(3)} exceeds $${MAX_REASONING_COST_USD}`,
        { eventType, featureId }
      );
      this.emitReasoningEscalation(
        session,
        eventType,
        featureId,
        'cost_cap_exceeded',
        `Prompt size (estimated $${estimatedInputCostUsd.toFixed(3)}) exceeds $${MAX_REASONING_COST_USD} cost cap`
      );
      return;
    }

    // 60-second timeout guard via AbortController
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, REASONING_TIMEOUT_MS);

    let responseText = '';
    let decision: ReasoningDecision | null = null;
    let attemptCount = 0;

    const model = resolveModelString('haiku');

    const attemptQuery = async (): Promise<ReasoningDecision | null> => {
      attemptCount++;
      const result = await simpleQuery({
        prompt,
        model,
        cwd: session.projectPath,
        maxTurns: 1,
        allowedTools: [],
        abortController,
        traceContext: {
          featureId,
          agentRole: 'lead-engineer-reasoning',
          projectSlug: session.projectSlug,
          phase: 'reasoning',
        },
      });
      responseText = result.text;
      return parseReasoningDecision(result.text);
    };

    try {
      decision = await attemptQuery();

      // Retry once on malformed response (per deviation rules)
      if (!decision && attemptCount < 2) {
        logger.warn('[Reasoning] First attempt produced malformed response — retrying once', {
          eventType,
          featureId,
        });
        decision = await attemptQuery();
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = abortController.signal.aborted;
      const reason = isTimeout ? 'reasoning_timeout' : 'reasoning_error';
      const details = isTimeout
        ? `Reasoning path timed out after ${REASONING_TIMEOUT_MS}ms`
        : String(err instanceof Error ? err.message : err);
      logger.warn(`[Reasoning] ${isTimeout ? 'Timeout' : 'Error'} — escalating`, {
        eventType,
        featureId,
        details,
      });
      this.emitReasoningEscalation(session, eventType, featureId, reason, details);
      return;
    }

    clearTimeout(timeoutId);

    if (!decision) {
      logger.warn('[Reasoning] Could not produce valid decision after retry — escalating', {
        eventType,
        featureId,
      });
      this.emitReasoningEscalation(
        session,
        eventType,
        featureId,
        'malformed_response',
        'LLM reasoning produced no valid action after retry'
      );
      return;
    }

    // Post-call cost tracking (informational — cost cap already enforced pre-call)
    const estimatedOutputCostUsd = responseText.length * HAIKU_OUTPUT_USD_PER_CHAR;
    const totalEstimatedCostUsd = estimatedInputCostUsd + estimatedOutputCostUsd;
    if (totalEstimatedCostUsd > MAX_REASONING_COST_USD) {
      logger.warn(
        `[Reasoning] Post-call cost estimate $${totalEstimatedCostUsd.toFixed(3)} exceeded cap`,
        { eventType, featureId }
      );
    }

    logger.info(`[Reasoning] Decision: ${decision.action}`, {
      eventType,
      featureId,
      reasoning: decision.reasoning?.slice(0, 150),
    });

    // Convert decision to actions and execute
    const actions = convertDecisionToActions(decision, featureId);
    if (actions.length === 0) return;

    const executor = this.getActionExecutor(undefined, session.projectPath);
    for (const action of actions) {
      await executor
        .executeAction(session, action)
        .catch((actionErr) =>
          logger.error(`[Reasoning] Action execution failed (${action.type}):`, actionErr)
        );
    }
  }
}

// ────────────────────────── Reasoning Path Helpers ──────────────────────────

/**
 * Structured decision returned by the LLM reasoning path.
 * The reasoning prompt asks the LLM to return exactly this shape.
 */
interface ReasoningDecision {
  action: 'reset_feature' | 'move_feature' | 'escalate' | 'no_action';
  reasoning?: string;
  featureId?: string;
  toStatus?: string;
  reason?: string;
}

/**
 * Build the reasoning prompt from signal context.
 *
 * Context structure:
 * - eventType: the triggering signal type (e.g. 'escalation:signal-received')
 * - payload: raw signal payload
 * - featureState: current feature snapshot from world state
 * - statusChangeReason: last recorded reason for the feature's status
 * - worldStateSummary: board counts, agent count, error budget state
 * - trajectoryReflections: last 3 attempts' escalation/execution summaries
 * - recentRuleLog: last 5 rule evaluations for recent activity context
 */
function buildReasoningPrompt(context: {
  eventType: string;
  payload: unknown;
  featureState: unknown;
  statusChangeReason?: string;
  worldStateSummary: unknown;
  trajectoryReflections: string[];
  recentRuleLog: unknown;
}): string {
  return `You are the Lead Engineer AI reasoning about what action to take for an incoming signal.

## Signal Context
Event type: ${context.eventType}
Payload: ${JSON.stringify(context.payload, null, 2).slice(0, 1000)}

## Feature State
${JSON.stringify(context.featureState, null, 2).slice(0, 1500)}

## Status Change Reason
${context.statusChangeReason ?? 'none'}

## World State Summary
${JSON.stringify(context.worldStateSummary, null, 2)}

## Recent Trajectory (last 3 attempts)
${context.trajectoryReflections.length > 0 ? context.trajectoryReflections.join('\n') : 'No previous attempts'}

## Recent Rule Log (last 5 evaluations)
${JSON.stringify(context.recentRuleLog, null, 2)}

## Available Actions
- reset_feature: Move the feature back to backlog for retry (transient failures)
- move_feature: Move the feature to a specific status (toStatus required)
- escalate: Escalate to human for intervention (persistent failures, unclear situations)
- no_action: Take no action (signal does not require a response)

## Instructions
Reason about the signal, feature state, and history to decide the most appropriate action.
Respond with ONLY valid JSON (no markdown, no code fences):
{
  "action": "reset_feature|move_feature|escalate|no_action",
  "reasoning": "brief explanation of why",
  "featureId": "the feature ID (required)",
  "toStatus": "backlog|blocked|review|done|in_progress (only if action is move_feature)",
  "reason": "human-readable reason for the action"
}`;
}

/**
 * Parse a JSON reasoning decision from LLM text output.
 * Returns null if the response is malformed or contains an invalid action.
 */
function parseReasoningDecision(text: string): ReasoningDecision | null {
  try {
    const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (!parsed.action || typeof parsed.action !== 'string') return null;
    const validActions = new Set(['reset_feature', 'move_feature', 'escalate', 'no_action']);
    if (!validActions.has(parsed.action)) return null;
    return {
      action: parsed.action as ReasoningDecision['action'],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
      featureId: typeof parsed.featureId === 'string' ? parsed.featureId : undefined,
      toStatus: typeof parsed.toStatus === 'string' ? parsed.toStatus : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Convert a reasoning decision to LeadRuleAction[] for execution.
 * Falls back to featureId from the signal context if decision.featureId is absent.
 */
function convertDecisionToActions(
  decision: ReasoningDecision,
  contextFeatureId: string
): LeadRuleAction[] {
  const actions: LeadRuleAction[] = [];
  const targetFeatureId = decision.featureId ?? contextFeatureId;

  switch (decision.action) {
    case 'reset_feature':
      actions.push({
        type: 'reset_feature',
        featureId: targetFeatureId,
        reason:
          decision.reason ?? `Reasoning path: ${decision.reasoning ?? 'LLM decided to retry'}`,
      });
      break;

    case 'move_feature':
      if (decision.toStatus) {
        actions.push({
          type: 'move_feature',
          featureId: targetFeatureId,
          toStatus: decision.toStatus as FeatureStatus,
        });
      }
      break;

    case 'escalate':
      actions.push({
        type: 'log',
        level: 'warn',
        message: `[Reasoning] Escalation decision for ${targetFeatureId}: ${decision.reason ?? decision.reasoning ?? 'LLM decided to escalate'}`,
      });
      break;

    case 'no_action':
    default:
      break;
  }

  return actions;
}
