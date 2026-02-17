/**
 * Lead Engineer Service — Production Phase Nerve Center
 *
 * Orchestrates the full execution lifecycle for a project:
 * 1. Triggers from project:lifecycle:launched event or MCP tool
 * 2. Starts auto-mode and subscribes to the event bus
 * 3. Maintains a WorldState (board + agents + PRs + metrics)
 * 4. Evaluates fast-path rules on every event (pure functions, no LLM)
 * 5. On project completion: CeremonyService handles retro, we handle metrics
 * 6. Guards crew members from duplicating work on managed projects
 */

import { createLogger } from '@automaker/utils';
import type {
  EventType,
  Feature,
  LeadWorldState,
  LeadFeatureSnapshot,
  LeadAgentSnapshot,
  LeadPRSnapshot,
  LeadMilestoneSnapshot,
  LeadRuleAction,
  LeadEngineerSession,
  LeadEngineerFlowState,
  LeadRuleLogEntry,
} from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { ProjectService } from './project-service.js';
import type { ProjectLifecycleService } from './project-lifecycle-service.js';
import type { SettingsService } from './settings-service.js';
import type { MetricsService } from './metrics-service.js';
import { DEFAULT_RULES, evaluateRules } from './lead-engineer-rules.js';

const logger = createLogger('LeadEngineerService');

const WORLD_STATE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RULE_LOG_ENTRIES = 200;

export class LeadEngineerService {
  private sessions = new Map<string, LeadEngineerSession>();
  private unsubscribe: (() => void) | null = null;
  private refreshIntervals = new Map<string, ReturnType<typeof setInterval>>();

  private discordBotService?: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  };

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private projectService: ProjectService,
    private projectLifecycleService: ProjectLifecycleService,
    private settingsService: SettingsService,
    private metricsService: MetricsService
  ) {}

  /**
   * Set Discord bot service for post_discord action.
   */
  setDiscordBot(bot: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  }): void {
    this.discordBotService = bot;
  }

  /**
   * Subscribe to events for auto-start and routing.
   */
  initialize(): void {
    // Auto-start when a project is launched
    this.unsubscribe = this.events.subscribe((type: EventType, payload: unknown) => {
      if (type === 'project:lifecycle:launched') {
        const p = payload as { projectPath?: string; projectSlug?: string } | null;
        if (p?.projectPath && p?.projectSlug) {
          this.start(p.projectPath, p.projectSlug).catch((err) => {
            logger.error(`Auto-start failed for ${p.projectSlug}:`, err);
          });
        }
        return;
      }

      // Route all events to managed sessions
      this.onEvent(type, payload);
    });

    logger.info('LeadEngineerService initialized');
  }

  /**
   * Clean up subscriptions and stop all sessions.
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    for (const [projectPath] of this.sessions) {
      this.stopSession(projectPath);
    }
    this.sessions.clear();

    logger.info('LeadEngineerService destroyed');
  }

  /**
   * Start managing a project through the production phase.
   */
  async start(
    projectPath: string,
    projectSlug: string,
    opts?: { maxConcurrency?: number }
  ): Promise<LeadEngineerSession> {
    if (this.sessions.has(projectPath)) {
      const existing = this.sessions.get(projectPath)!;
      logger.warn(`Already managing project at ${projectPath}, returning existing session`);
      return existing;
    }

    logger.info(`Starting Lead Engineer for ${projectSlug} at ${projectPath}`);

    // Build initial world state
    const worldState = await this.buildWorldState(projectPath, projectSlug, opts?.maxConcurrency);

    // Create session
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

    // Start auto-mode if not already running
    if (!worldState.autoModeRunning && (worldState.boardCounts['backlog'] || 0) > 0) {
      try {
        await this.projectLifecycleService.launch(projectPath, projectSlug, opts?.maxConcurrency);
      } catch (err) {
        logger.warn(`Failed to start auto-mode for ${projectSlug}:`, err);
      }
    }

    // Set up periodic world state refresh
    const interval = setInterval(async () => {
      try {
        const s = this.sessions.get(projectPath);
        if (!s || s.flowState !== 'running') return;

        s.worldState = await this.buildWorldState(
          projectPath,
          projectSlug,
          s.worldState.maxConcurrency
        );

        // Evaluate periodic rules (stuckAgent, staleReview, orphanedInProgress)
        this.evaluateAndExecute(s, 'lead-engineer:rule-evaluated', {});
      } catch (err) {
        logger.error(`WorldState refresh failed for ${projectSlug}:`, err);
      }
    }, WORLD_STATE_REFRESH_MS);
    this.refreshIntervals.set(projectPath, interval);

    this.events.emit('lead-engineer:started', { projectPath, projectSlug });
    logger.info(`Lead Engineer started for ${projectSlug}`);

    return session;
  }

  /**
   * Stop managing a project.
   */
  stop(projectPath: string): void {
    const session = this.sessions.get(projectPath);
    if (!session) {
      logger.warn(`No session found for ${projectPath}`);
      return;
    }

    this.stopSession(projectPath);
    session.flowState = 'stopped';
    session.stoppedAt = new Date().toISOString();
    this.sessions.delete(projectPath);

    this.events.emit('lead-engineer:stopped', {
      projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Lead Engineer stopped for ${session.projectSlug}`);
  }

  /**
   * Get session for a project.
   */
  getSession(projectPath: string): LeadEngineerSession | undefined {
    return this.sessions.get(projectPath);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): LeadEngineerSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if a project is managed by Lead Engineer.
   * Used by crew members to skip managed projects.
   */
  isManaged(projectPath: string): boolean {
    return this.sessions.has(projectPath);
  }

  /**
   * Get all managed project paths.
   */
  getManagedProjectPaths(): string[] {
    return Array.from(this.sessions.keys());
  }

  // ────────────────────────── Private ──────────────────────────

  private stopSession(projectPath: string): void {
    const interval = this.refreshIntervals.get(projectPath);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(projectPath);
    }
  }

  /**
   * Route an event to the appropriate session.
   */
  private onEvent(type: EventType, payload: unknown): void {
    const p = payload as Record<string, unknown> | null;
    const projectPath = p?.projectPath as string | undefined;

    if (projectPath) {
      const session = this.sessions.get(projectPath);
      if (session && session.flowState === 'running') {
        this.updateWorldStateFromEvent(session.worldState, type, payload);
        this.evaluateAndExecute(session, type, payload);
      }
      return;
    }

    // For events without projectPath (e.g., auto-mode events), try to match by featureId
    const featureId = p?.featureId as string | undefined;
    if (featureId) {
      for (const session of this.sessions.values()) {
        if (session.flowState !== 'running') continue;
        if (session.worldState.features[featureId]) {
          this.updateWorldStateFromEvent(session.worldState, type, payload);
          this.evaluateAndExecute(session, type, payload);
          return;
        }
      }
    }
  }

  /**
   * Build a complete WorldState from scratch.
   */
  private async buildWorldState(
    projectPath: string,
    projectSlug: string,
    maxConcurrency?: number
  ): Promise<LeadWorldState> {
    const features = await this.featureLoader.getAll(projectPath);

    // Board counts
    const boardCounts: Record<string, number> = {};
    for (const f of features) {
      const status = f.status || 'backlog';
      boardCounts[status] = (boardCounts[status] || 0) + 1;
    }

    // Feature snapshots
    const featureMap: Record<string, LeadFeatureSnapshot> = {};
    for (const f of features) {
      featureMap[f.id] = this.featureToSnapshot(f);
    }

    // Running agents
    const agents: LeadAgentSnapshot[] = [];
    try {
      const runningAgents = await this.autoModeService.getRunningAgents();
      for (const a of runningAgents) {
        if (a.projectPath === projectPath) {
          agents.push({
            featureId: a.featureId,
            startTime: new Date(a.startTime).toISOString(),
            branch: a.branchName ?? undefined,
          });
        }
      }
    } catch {
      // Running agents API may fail
    }

    // Open PRs
    const openPRs: LeadPRSnapshot[] = [];
    const reviewFeatures = features.filter((f) => f.status === 'review' && f.prNumber);
    for (const f of reviewFeatures) {
      openPRs.push({
        featureId: f.id,
        prNumber: f.prNumber!,
        prUrl: f.prUrl,
        prCreatedAt: f.prCreatedAt,
      });
    }

    // Milestones
    const milestones: LeadMilestoneSnapshot[] = [];
    try {
      const project = await this.projectService.getProject(projectPath, projectSlug);
      if (project?.milestones) {
        for (const ms of project.milestones) {
          const totalPhases = ms.phases?.length || 0;
          // Count completed phases by checking if their linked features are done
          const completedPhases =
            ms.phases?.filter((p) => {
              if (!p.featureId) return false;
              const f = featureMap[p.featureId];
              return f && (f.status === 'done' || f.status === 'verified');
            }).length || 0;
          milestones.push({
            slug: ms.slug || ms.title.toLowerCase().replace(/\s+/g, '-'),
            title: ms.title,
            totalPhases,
            completedPhases,
          });
        }
      }
    } catch {
      // Project may not have milestones
    }

    // Metrics
    const completedFeatures = features.filter(
      (f) => f.status === 'done' || f.status === 'verified'
    ).length;
    const totalCostUsd = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);

    let avgCycleTimeMs: number | undefined;
    try {
      const metrics = await this.metricsService.getProjectMetrics(projectPath);
      avgCycleTimeMs = metrics.avgCycleTimeMs > 0 ? metrics.avgCycleTimeMs : undefined;
    } catch {
      // Metrics may not be available
    }

    // Auto-mode status
    const activeProjects = this.autoModeService.getActiveAutoLoopProjects();
    const autoModeRunning = activeProjects.includes(projectPath);

    // Resolve max concurrency
    let resolvedMaxConcurrency = maxConcurrency || 1;
    try {
      const settings = await this.settingsService.getGlobalSettings();
      resolvedMaxConcurrency = maxConcurrency || settings.maxConcurrency || 1;
    } catch {
      // Fallback
    }

    return {
      projectPath,
      projectSlug,
      updatedAt: new Date().toISOString(),
      boardCounts,
      features: featureMap,
      agents,
      openPRs,
      milestones,
      metrics: {
        totalFeatures: features.length,
        completedFeatures,
        totalCostUsd,
        avgCycleTimeMs,
      },
      autoModeRunning,
      maxConcurrency: resolvedMaxConcurrency,
    };
  }

  /**
   * Incrementally patch WorldState from a single event.
   */
  private updateWorldStateFromEvent(
    state: LeadWorldState,
    type: EventType,
    payload: unknown
  ): void {
    const p = payload as Record<string, unknown> | null;
    const featureId = p?.featureId as string | undefined;
    const now = new Date().toISOString();

    state.updatedAt = now;

    switch (type) {
      case 'feature:status-changed': {
        if (featureId && state.features[featureId]) {
          const newStatus = p?.newStatus as string | undefined;
          if (newStatus) {
            const oldStatus = state.features[featureId].status;
            state.features[featureId].status = newStatus;

            // Update board counts
            if (oldStatus) {
              state.boardCounts[oldStatus] = Math.max(0, (state.boardCounts[oldStatus] || 0) - 1);
            }
            state.boardCounts[newStatus] = (state.boardCounts[newStatus] || 0) + 1;

            // Update metrics
            if (newStatus === 'done' || newStatus === 'verified') {
              state.metrics.completedFeatures++;
              state.features[featureId].completedAt = now;
            }
          }
        }
        break;
      }

      case 'feature:started': {
        if (featureId && state.features[featureId]) {
          state.features[featureId].status = 'in_progress';
          state.features[featureId].startedAt = now;
          state.agents.push({ featureId, startTime: now });
        }
        break;
      }

      case 'feature:completed':
      case 'feature:stopped':
      case 'feature:error': {
        if (featureId) {
          state.agents = state.agents.filter((a) => a.featureId !== featureId);
        }
        break;
      }

      case 'feature:pr-merged': {
        if (featureId && state.features[featureId]) {
          state.features[featureId].prMergedAt = now;
          state.openPRs = state.openPRs.filter((pr) => pr.featureId !== featureId);
        }
        break;
      }

      case 'auto-mode:started': {
        state.autoModeRunning = true;
        break;
      }

      case 'auto-mode:stopped': {
        state.autoModeRunning = false;
        break;
      }
    }
  }

  /**
   * Evaluate rules and execute resulting actions.
   */
  private evaluateAndExecute(
    session: LeadEngineerSession,
    eventType: string,
    payload: unknown
  ): void {
    const actions = evaluateRules(DEFAULT_RULES, session.worldState, eventType, payload);

    if (actions.length === 0) return;

    // Determine which rules produced actions (for logging)
    for (const rule of DEFAULT_RULES) {
      if (!rule.triggers.includes(eventType)) continue;
      const ruleActions = rule.evaluate(session.worldState, eventType, payload);
      if (ruleActions.length > 0) {
        const entry: LeadRuleLogEntry = {
          timestamp: new Date().toISOString(),
          ruleName: rule.name,
          eventType,
          actions: ruleActions,
        };
        session.ruleLog.push(entry);

        this.events.emit('lead-engineer:rule-evaluated', {
          projectPath: session.projectPath,
          ruleName: rule.name,
          eventType,
          actionCount: ruleActions.length,
        });
      }
    }

    // Cap rule log size
    if (session.ruleLog.length > MAX_RULE_LOG_ENTRIES) {
      session.ruleLog = session.ruleLog.slice(-MAX_RULE_LOG_ENTRIES);
    }

    // Execute all actions
    for (const action of actions) {
      this.executeAction(session, action).catch((err) => {
        logger.error(`Action execution failed (${action.type}):`, err);
      });
    }
  }

  /**
   * Execute a single rule action.
   */
  private async executeAction(session: LeadEngineerSession, action: LeadRuleAction): Promise<void> {
    session.actionsTaken++;

    this.events.emit('lead-engineer:action-executed', {
      projectPath: session.projectPath,
      actionType: action.type,
      details: action as unknown as Record<string, unknown>,
    });

    switch (action.type) {
      case 'move_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: action.toStatus,
          });
          logger.info(`Moved feature ${action.featureId} to ${action.toStatus}`);
        } catch (err) {
          logger.error(`Failed to move feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'reset_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: 'backlog',
          });
          logger.info(`Reset feature ${action.featureId}: ${action.reason}`);
        } catch (err) {
          logger.error(`Failed to reset feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'unblock_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: 'backlog',
          });
          logger.info(`Unblocked feature ${action.featureId}`);
        } catch (err) {
          logger.error(`Failed to unblock feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'enable_auto_merge': {
        try {
          const { execSync } = await import('child_process');
          execSync(`gh pr merge ${action.prNumber} --auto --squash`, {
            cwd: session.projectPath,
            stdio: 'pipe',
          });
          logger.info(`Enabled auto-merge on PR #${action.prNumber}`);
        } catch (err) {
          logger.warn(`Failed to enable auto-merge on PR #${action.prNumber}:`, err);
        }
        break;
      }

      case 'resolve_threads': {
        this.events.emit('escalation:signal-received', {
          source: 'pr_feedback',
          severity: 'medium',
          type: 'thread_resolution_requested',
          context: {
            featureId: action.featureId,
            prNumber: action.prNumber,
            projectPath: session.projectPath,
          },
          deduplicationKey: `resolve_threads_${action.prNumber}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'restart_auto_mode': {
        try {
          await this.autoModeService.startAutoLoop(
            action.projectPath,
            action.maxConcurrency || session.worldState.maxConcurrency
          );
          session.worldState.autoModeRunning = true;
          logger.info(`Restarted auto-mode for ${action.projectPath}`);
        } catch (err) {
          logger.warn(`Failed to restart auto-mode:`, err);
        }
        break;
      }

      case 'stop_agent': {
        try {
          await this.autoModeService.stopFeature(action.featureId);
          logger.info(`Stopped agent for feature ${action.featureId}`);
        } catch (err) {
          logger.warn(`Failed to stop agent for ${action.featureId}:`, err);
        }
        break;
      }

      case 'send_agent_message': {
        try {
          await this.autoModeService.followUpFeature(
            session.projectPath,
            action.featureId,
            action.message
          );
          logger.info(`Sent message to agent for feature ${action.featureId}`);
        } catch (err) {
          logger.warn(`Failed to send message to agent ${action.featureId}:`, err);
        }
        break;
      }

      case 'post_discord': {
        if (this.discordBotService) {
          await this.discordBotService
            .sendToChannel(action.channelId, action.message)
            .catch((err) => logger.warn(`Failed to post to Discord: ${err}`));
        }
        break;
      }

      case 'log': {
        logger[action.level](`[Rule] ${action.message}`);
        break;
      }

      case 'escalate_llm': {
        this.events.emit('escalation:signal-received', {
          source: 'crew_escalation',
          severity: 'high',
          type: 'lead_engineer_escalation',
          context: {
            ...action.context,
            projectPath: session.projectPath,
            reason: action.reason,
          },
          deduplicationKey: `le_escalation_${session.projectPath}_${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'project_completing': {
        await this.handleProjectCompleting(session);
        break;
      }
    }
  }

  /**
   * Handle project completion: transition to completing state.
   * CeremonyService handles retro + Discord automatically (already subscribed to project:completed).
   * Lead Engineer aggregates final metrics.
   */
  private async handleProjectCompleting(session: LeadEngineerSession): Promise<void> {
    session.flowState = 'completing';
    this.events.emit('lead-engineer:project-completing', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completing — aggregating final metrics`);

    // Refresh final world state
    try {
      session.worldState = await this.buildWorldState(
        session.projectPath,
        session.projectSlug,
        session.worldState.maxConcurrency
      );
    } catch (err) {
      logger.error(`Failed to build final world state:`, err);
    }

    // Emit completion event
    this.events.emit('lead-engineer:project-completed', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    // Transition to idle
    session.flowState = 'idle';

    // Clean up
    this.stopSession(session.projectPath);
    this.sessions.delete(session.projectPath);

    this.events.emit('lead-engineer:stopped', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completed. Lead Engineer session ended.`);
  }

  /**
   * Convert a Feature to a LeadFeatureSnapshot.
   */
  private featureToSnapshot(f: Feature): LeadFeatureSnapshot {
    return {
      id: f.id,
      title: f.title,
      status: (f.status as string) || 'backlog',
      branchName: f.branchName,
      prNumber: f.prNumber,
      prUrl: f.prUrl,
      prCreatedAt: f.prCreatedAt,
      prMergedAt: f.prMergedAt,
      costUsd: f.costUsd,
      failureCount: f.failureCount,
      dependencies: f.dependencies,
      epicId: f.epicId,
      isEpic: f.isEpic,
      complexity: f.complexity,
      startedAt: f.startedAt,
      completedAt: f.completedAt,
    };
  }
}
