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

import { createLogger } from '@protolabs-ai/utils';
import type { EventType, LeadEngineerSession, ExecuteOptions } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
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
import type { TrajectoryStoreService } from './trajectory-store-service.js';
import type { LeadHandoffService } from './lead-handoff-service.js';
import { DEFAULT_RULES } from './lead-engineer-rules.js';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import { FeatureStateMachine } from './lead-engineer-state-machine.js';
import { WorldStateBuilder } from './lead-engineer-world-state.js';
import { ActionExecutor } from './lead-engineer-action-executor.js';
import { CeremonyOrchestrator } from './lead-engineer-ceremonies.js';
import { LeadEngineerSessionStore } from './lead-engineer-session-store.js';
import { GtmExecuteProcessor } from './lead-engineer-gtm-execute-processor.js';
import type { FeatureProcessingState, StateContext } from './lead-engineer-types.js';
import type { AgentFactoryService } from './agent-factory-service.js';
import { GtmReviewProcessor } from './lead-engineer-gtm-review-processor.js';

export type { FeatureProcessingState, StateContext };
export type { ProcessorServiceContext } from './lead-engineer-types.js';
export { FeatureStateMachine } from './lead-engineer-state-machine.js';

const logger = createLogger('LeadEngineerService');
const WORLD_STATE_REFRESH_MS = 5 * 60 * 1000;
const MAX_RULE_LOG_ENTRIES = 200;
const SUPERVISOR_CHECK_MS = 30 * 1000;

export class LeadEngineerService {
  private sessions = new Map<string, LeadEngineerSession>();
  private unsubscribe: (() => void) | null = null;
  private refreshIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private supervisorIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private activeFeatures = new Set<string>();

  private discordBotService?: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  };
  private codeRabbitResolver?: CodeRabbitResolverService;
  private prFeedbackService?: PRFeedbackService;
  private checkpointService?: PipelineCheckpointService;
  private contextFidelityService?: ContextFidelityService;
  private knowledgeStoreService?: KnowledgeStoreService;
  private trajectoryStoreService?: TrajectoryStoreService;
  private agentFactoryService?: AgentFactoryService;
  private handoffService?: LeadHandoffService;

  private worldStateBuilder: WorldStateBuilder;
  private sessionStore: LeadEngineerSessionStore;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private projectService: ProjectService,
    private projectLifecycleService: ProjectLifecycleService,
    private settingsService: SettingsService,
    private metricsService: MetricsService
  ) {
    this.worldStateBuilder = new WorldStateBuilder({
      featureLoader,
      autoModeService,
      projectService,
      metricsService,
      settingsService,
    });
    this.sessionStore = new LeadEngineerSessionStore({ featureLoader, settingsService });
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
  setTrajectoryStoreService(s: TrajectoryStoreService): void {
    this.trajectoryStoreService = s;
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
  setAgentFactory(s: AgentFactoryService): void {
    this.agentFactoryService = s;
  }
  setHandoffService(s: LeadHandoffService): void {
    this.handoffService = s;
  }

  async initialize(): Promise<void> {
    this.unsubscribe = this.events.subscribe((type: EventType, payload: unknown) => {
      if (type === 'project:lifecycle:launched') {
        const p = payload as { projectPath?: string; projectSlug?: string } | null;
        if (p?.projectPath && p?.projectSlug) {
          this.start(p.projectPath, p.projectSlug).catch((err) =>
            logger.error(`Auto-start failed for ${p.projectSlug}:`, err)
          );
        }
        return;
      }
      if (type === ('lead-engineer:project-completing-requested' as EventType)) {
        const p = payload as { projectPath?: string } | null;
        if (p?.projectPath) {
          const session = this.sessions.get(p.projectPath);
          if (session) void this.handleProjectCompleting(session);
        }
        return;
      }
      this.onEvent(type, payload);
    });
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
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
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
        .launch(projectPath, projectSlug, opts?.maxConcurrency)
        .catch((err) => logger.warn(`Failed to start auto-mode for ${projectSlug}:`, err));
    }

    this.refreshIntervals.set(
      projectPath,
      setInterval(async () => {
        const s = this.sessions.get(projectPath);
        if (!s || s.flowState !== 'running') return;
        try {
          s.worldState = await this.worldStateBuilder.build(
            projectPath,
            projectSlug,
            s.worldState.maxConcurrency
          );
          this.getActionExecutor().evaluateAndExecute(
            s,
            DEFAULT_RULES,
            'lead-engineer:rule-evaluated',
            {},
            MAX_RULE_LOG_ENTRIES
          );
        } catch (err) {
          logger.error(`WorldState refresh failed for ${projectSlug}:`, err);
        }
      }, WORLD_STATE_REFRESH_MS)
    );

    const workflowSettings = await getWorkflowSettings(
      projectPath,
      this.settingsService,
      '[LeadEngineer]'
    );
    if (workflowSettings.pipeline.supervisorEnabled) {
      const executor = this.getActionExecutor();
      this.supervisorIntervals.set(
        projectPath,
        setInterval(() => {
          const s = this.sessions.get(projectPath);
          if (s?.flowState === 'running') executor.supervisorCheck(s, workflowSettings);
        }, SUPERVISOR_CHECK_MS)
      );
    }

    await this.sessionStore.save(session);
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

  async process(projectPath: string, featureId: string, options: ExecuteOptions): Promise<void> {
    logger.info(`[LeadEngineer] Processing feature ${featureId}`, {
      projectPath,
      model: options.model,
    });
    this.activeFeatures.add(featureId);
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) throw new Error(`Feature ${featureId} not found`);

      let resumeFromCheckpoint:
        | { state: FeatureProcessingState; restoredContext?: Partial<StateContext> }
        | undefined;

      if (this.checkpointService) {
        const checkpoint = await this.checkpointService.load(projectPath, featureId);
        if (checkpoint) {
          logger.info(
            `[LeadEngineer] Resuming ${featureId} from checkpoint ${checkpoint.currentState}`
          );
          resumeFromCheckpoint = {
            state: checkpoint.currentState as FeatureProcessingState,
            restoredContext: this.checkpointService.restoreContext(checkpoint),
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
        trajectoryStoreService: this.trajectoryStoreService,
        settingsService: this.settingsService,
      };

      const workflowSettings = await getWorkflowSettings(
        projectPath,
        this.settingsService,
        '[LeadEngineer]'
      );
      const isContentFeature = feature.featureType === 'content';
      const stateMachine = new FeatureStateMachine(serviceContext, {
        checkpointService: workflowSettings.pipeline.checkpointEnabled
          ? this.checkpointService
          : undefined,
        events: this.events,
        // Content features bypass PR-centric goal gates (no PR is created)
        goalGatesEnabled: isContentFeature ? false : workflowSettings.pipeline.goalGatesEnabled,
      });
      if (isContentFeature) {
        stateMachine.registerProcessor('EXECUTE', new GtmExecuteProcessor());
        logger.info(`[LeadEngineer] Content feature ${featureId} routed to GtmExecuteProcessor`);
      }

      // Route content features to GtmReviewProcessor instead of standard ReviewProcessor
      if (feature.featureType === 'content' && this.agentFactoryService) {
        stateMachine.registerProcessor(
          'REVIEW',
          new GtmReviewProcessor(serviceContext, this.agentFactoryService)
        );
        logger.info(`[LeadEngineer] Content feature routed to GtmReviewProcessor`, { featureId });
      }
      const result = await stateMachine.processFeature(
        feature,
        projectPath,
        options,
        resumeFromCheckpoint
      );

      logger.info(`[LeadEngineer] Feature processing completed`, {
        featureId,
        finalState: result.finalState,
        escalated: result.finalState === 'ESCALATE',
      });
      this.events.emit('lead-engineer:feature-processed' as EventType, {
        projectPath,
        featureId,
        finalState: result.finalState,
        success: result.finalState !== 'ESCALATE',
      });
    } catch (error: unknown) {
      logger.error(`[LeadEngineer] Feature processing failed`, {
        featureId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.activeFeatures.delete(featureId);
    }
  }

  // ────────────────────────── Private ──────────────────────────

  private getActionExecutor(): ActionExecutor {
    return new ActionExecutor({
      events: this.events,
      featureLoader: this.featureLoader,
      autoModeService: this.autoModeService,
      codeRabbitResolver: this.codeRabbitResolver,
      discordBotService: this.discordBotService,
    });
  }

  private clearIntervals(projectPath: string): void {
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
  }

  private onEvent(type: EventType, payload: unknown): void {
    const p = payload as Record<string, unknown> | null;
    const nested = p?.payload as Record<string, unknown> | null;
    const projectPath = (p?.projectPath ?? nested?.projectPath) as string | undefined;

    if (projectPath) {
      const session = this.sessions.get(projectPath);
      if (session?.flowState === 'running') {
        this.worldStateBuilder.updateFromEvent(session.worldState, type, payload);
        this.getActionExecutor().evaluateAndExecute(
          session,
          DEFAULT_RULES,
          type,
          payload,
          MAX_RULE_LOG_ENTRIES
        );
      }
      return;
    }

    const featureId = (p?.featureId ?? nested?.featureId) as string | undefined;
    if (featureId) {
      for (const session of this.sessions.values()) {
        if (session.flowState !== 'running' || !session.worldState.features[featureId]) continue;
        this.worldStateBuilder.updateFromEvent(session.worldState, type, payload);
        this.getActionExecutor().evaluateAndExecute(
          session,
          DEFAULT_RULES,
          type,
          payload,
          MAX_RULE_LOG_ENTRIES
        );
        return;
      }
    }
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
}
