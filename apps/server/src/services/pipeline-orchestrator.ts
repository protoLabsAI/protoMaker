/**
 * PipelineOrchestrator — Unified Idea-to-Production Pipeline
 *
 * Coordinates the 9-phase pipeline (TRIAGE → RESEARCH → SPEC → SPEC_REVIEW →
 * DESIGN → PLAN → EXECUTE → VERIFY → PUBLISH) across ops and gtm branches.
 *
 * Operates in two modes:
 * - **Passive**: Observes existing events and updates pipelineState on features.
 * - **Active** (when processors are registered): Dispatches to agent executePhase()
 *   methods when available, falling back to event emission for phases without processors.
 */

import { randomUUID } from 'node:crypto';
import type { EventBus, EventCallback, EventType } from '@protolabs-ai/types';
import {
  DEFAULT_PIPELINE_GATES,
  GTM_SKIP_PHASES,
  PIPELINE_PHASES,
  type GateMode,
  type PipelineBranch,
  type PipelinePhase,
  type PipelineState,
} from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import type { PhaseProcessor } from './authority-agents/agent-utils.js';
import type { ChannelRouter } from './channel-router.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { getLangfuseInstance } from '../lib/langfuse-singleton.js';

const logger = createLogger('PipelineOrchestrator');

/**
 * Maps existing events to pipeline phase transitions.
 * The orchestrator listens for these events and updates pipeline state.
 */
const EVENT_PHASE_MAP: Record<
  string,
  { phase: PipelinePhase; action: 'entered' | 'completed'; branch?: PipelineBranch }
> = {
  // TRIAGE phase completion
  'signal:routed': { phase: 'TRIAGE', action: 'completed' },

  // RESEARCH phase
  'authority:pm-research-started': { phase: 'RESEARCH', action: 'entered', branch: 'ops' },
  'authority:pm-research-completed': { phase: 'RESEARCH', action: 'completed', branch: 'ops' },
  'authority:gtm-research-started': { phase: 'RESEARCH', action: 'entered', branch: 'gtm' },

  // SPEC phase completion
  'authority:pm-prd-ready': { phase: 'SPEC', action: 'completed', branch: 'ops' },
  'ideation:prd-generated': { phase: 'SPEC', action: 'completed', branch: 'ops' },
  'content:draft-ready': { phase: 'SPEC', action: 'completed', branch: 'gtm' },

  // SPEC_REVIEW resolution
  'authority:pm-review-approved': { phase: 'SPEC_REVIEW', action: 'completed', branch: 'ops' },
  'ideation:prd-approved': { phase: 'SPEC_REVIEW', action: 'completed', branch: 'ops' },
  'content:draft-approved': { phase: 'SPEC_REVIEW', action: 'completed', branch: 'gtm' },

  // DESIGN completion
  'milestone:planned': { phase: 'DESIGN', action: 'completed' },

  // PLAN completion
  'milestone:started': { phase: 'PLAN', action: 'completed' },

  // EXECUTE phase
  'feature:started': { phase: 'EXECUTE', action: 'entered' },
  'feature:completed': { phase: 'EXECUTE', action: 'completed' },

  // VERIFY phase
  'pr:approved': { phase: 'VERIFY', action: 'completed' },
  'github:pr:approved': { phase: 'VERIFY', action: 'completed' },

  // PUBLISH phase
  'feature:pr-merged': { phase: 'PUBLISH', action: 'completed' },
};

/**
 * Maps pipeline phases to their processor role.
 * When a processor is registered for a phase, the orchestrator calls executePhase()
 * instead of just observing events.
 */
const PHASE_PROCESSOR_MAP: Record<PipelinePhase, 'ops' | 'gtm' | 'projm' | null> = {
  TRIAGE: null, // Handled by SignalIntakeService (already complete by initiation)
  RESEARCH: 'ops', // PM Agent (ops) or GTM Agent (gtm) — dispatched by branch
  SPEC: 'ops', // PM Agent (ops) or GTM Agent (gtm)
  SPEC_REVIEW: null, // Gate — no processor needed
  DESIGN: 'projm', // ProjM Agent
  PLAN: 'projm', // ProjM Agent
  EXECUTE: null, // Auto-mode / Lead Engineer (triggered via events)
  VERIFY: null, // CI + review (triggered via events)
  PUBLISH: null, // Merge (triggered via events)
};

export class PipelineOrchestrator {
  private unsubscribe: (() => void) | null = null;
  /** Track active pipelines: featureId → projectPath */
  private activePipelines = new Map<string, string>();
  /** Track per-phase start times for duration calculation */
  private phaseStartTimes = new Map<string, number>();
  /** Registered phase processors by role */
  private processors = new Map<string, PhaseProcessor>();
  /** Optional channel router for routing gate-hold notifications */
  private channelRouter: ChannelRouter | null = null;
  /** Completed pipelines today (for analytics) */
  private completedToday: Array<{ featureId: string; completedAt: number; durationMs: number }> =
    [];
  /** Total gate evaluations and holds (for analytics) */
  private gateStats = { evaluations: 0, holds: 0 };
  /** Per-phase completion durations (for analytics breakdown) */
  private phaseDurations = new Map<PipelinePhase, number[]>();

  constructor(
    private events: EventBus,
    private featureLoader: FeatureLoader,
    private settingsService: SettingsService
  ) {
    this.setupEventListeners();
    logger.info('PipelineOrchestrator initialized');
  }

  /**
   * Register phase processors (authority agents) for active dispatch.
   * When processors are registered, the orchestrator calls their executePhase()
   * method instead of relying solely on event observation.
   */
  setProcessors(processors: {
    ops?: PhaseProcessor;
    gtm?: PhaseProcessor;
    projm?: PhaseProcessor;
  }): void {
    if (processors.ops) this.processors.set('ops', processors.ops);
    if (processors.gtm) this.processors.set('gtm', processors.gtm);
    if (processors.projm) this.processors.set('projm', processors.projm);
    logger.info(`Phase processors registered: ${Array.from(this.processors.keys()).join(', ')}`);
  }

  /**
   * Wire in the channel router for gate-hold approval routing.
   * When set, gate holds will call channelRouter.getHandler(feature).requestApproval()
   * in addition to emitting the pipeline:gate-waiting event.
   */
  setChannelRouter(channelRouter: ChannelRouter): void {
    this.channelRouter = channelRouter;
    logger.info('ChannelRouter wired into PipelineOrchestrator');
  }

  /**
   * Initialize a new pipeline for a feature.
   * Called when a signal is classified and routed.
   */
  async initiate(
    projectPath: string,
    featureId: string,
    branch: PipelineBranch,
    title?: string
  ): Promise<PipelineState | null> {
    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature) {
      logger.warn(`Cannot initiate pipeline: feature ${featureId} not found`);
      return null;
    }

    if (feature.pipelineState) {
      logger.warn(`Feature ${featureId} already has a pipeline state, skipping initiation`);
      return feature.pipelineState;
    }

    const now = new Date().toISOString();
    const traceId = randomUUID();

    const pipelineState: PipelineState = {
      currentPhase: 'TRIAGE',
      branch,
      phaseHistory: [
        {
          from: null,
          to: 'TRIAGE',
          timestamp: now,
          triggeredBy: 'system',
          reason: `Pipeline initiated for ${branch} branch`,
        },
      ],
      awaitingGate: false,
      startedAt: now,
      traceId,
      phaseSpanIds: {},
    };

    // Create Langfuse trace
    const langfuse = getLangfuseInstance();
    if (langfuse.isAvailable()) {
      langfuse.createTrace({
        id: traceId,
        name: `pipeline:${branch}:${title ?? featureId}`,
        tags: [`branch:${branch}`, `feature:${featureId}`],
        metadata: { featureId, projectPath, branch },
      });

      // Create span for TRIAGE phase
      const spanId = randomUUID();
      langfuse.createSpan({
        traceId,
        id: spanId,
        name: 'phase:TRIAGE',
        metadata: { phase: 'TRIAGE', branch },
      });
      pipelineState.phaseSpanIds!.TRIAGE = spanId;
    }

    // Save pipeline state on feature
    await this.featureLoader.update(projectPath, featureId, { pipelineState });
    this.activePipelines.set(featureId, projectPath);
    this.phaseStartTimes.set(`${featureId}:TRIAGE`, Date.now());

    // Emit events
    this.events.emit('pipeline:phase-entered', {
      featureId,
      projectPath,
      phase: 'TRIAGE',
      branch,
      timestamp: now,
      pipelineState,
    });

    this.events.emit('pipeline:trace-linked', {
      featureId,
      projectPath,
      traceId,
      phase: 'TRIAGE',
      spanId: pipelineState.phaseSpanIds?.TRIAGE,
      timestamp: now,
    });

    logger.info(`Pipeline initiated for feature ${featureId} (${branch} branch)`, { traceId });
    return pipelineState;
  }

  /**
   * Advance a feature to the next pipeline phase.
   * Evaluates the gate for the next phase and either proceeds or holds.
   */
  async advancePhase(
    projectPath: string,
    featureId: string
  ): Promise<{ advanced: boolean; phase: PipelinePhase; held: boolean }> {
    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature?.pipelineState) {
      return { advanced: false, phase: 'TRIAGE', held: false };
    }

    const { pipelineState } = feature;
    const { branch, currentPhase } = pipelineState;

    // Complete current phase span in Langfuse
    this.endPhaseSpan(pipelineState, currentPhase, featureId);

    // Emit phase-completed event
    const startKey = `${featureId}:${currentPhase}`;
    const durationMs = this.phaseStartTimes.has(startKey)
      ? Date.now() - this.phaseStartTimes.get(startKey)!
      : undefined;
    this.phaseStartTimes.delete(startKey);

    // Track phase duration for analytics
    if (durationMs !== undefined) {
      const existing = this.phaseDurations.get(currentPhase) ?? [];
      existing.push(durationMs);
      this.phaseDurations.set(currentPhase, existing);
    }

    // Persist phase duration to feature state
    if (durationMs !== undefined) {
      if (!pipelineState.phaseDurations) {
        pipelineState.phaseDurations = {};
      }
      pipelineState.phaseDurations[currentPhase] = durationMs;
      await this.featureLoader.update(projectPath, featureId, { pipelineState });
    }

    this.events.emit('pipeline:phase-completed', {
      featureId,
      projectPath,
      phase: currentPhase,
      branch,
      durationMs,
      timestamp: new Date().toISOString(),
      pipelineState,
    });

    // Determine next phase
    const nextPhase = this.getNextPhase(currentPhase, branch);
    if (!nextPhase) {
      // Pipeline complete — track for analytics
      const totalDuration = pipelineState.startedAt
        ? Date.now() - new Date(pipelineState.startedAt).getTime()
        : 0;
      this.completedToday.push({
        featureId,
        completedAt: Date.now(),
        durationMs: totalDuration,
      });
      logger.info(`Pipeline complete for feature ${featureId} (${totalDuration}ms total)`);
      this.activePipelines.delete(featureId);
      return { advanced: false, phase: currentPhase, held: false };
    }

    // Evaluate gate
    const gateMode = await this.getGateMode(
      projectPath,
      featureId,
      nextPhase,
      branch,
      pipelineState
    );
    const gateResult = await this.evaluateGate(gateMode, featureId, nextPhase);

    // Track gate evaluation for analytics
    this.gateStats.evaluations++;
    if (gateResult === 'hold') this.gateStats.holds++;

    if (gateResult === 'hold') {
      // Hold at gate — persist which phase is gated for correct resolution
      const now = new Date().toISOString();
      pipelineState.awaitingGate = true;
      pipelineState.awaitingGatePhase = nextPhase;
      pipelineState.gateWaitingSince = now;
      await this.featureLoader.update(projectPath, featureId, { pipelineState });

      this.events.emit('pipeline:gate-waiting', {
        featureId,
        projectPath,
        phase: nextPhase,
        branch,
        gateMode,
        timestamp: now,
        pipelineState,
      });

      // Emit feature:verify-pending when VERIFY gate holds so consumers can act on it
      if (nextPhase === 'VERIFY') {
        this.events.emit('feature:verify-pending', { featureId, projectPath });
      }

      // Route approval request through the originating channel
      if (this.channelRouter) {
        const gateContext = `phase=${nextPhase}, gateMode=${gateMode}`;
        this.channelRouter
          .getHandler(feature)
          .requestApproval(feature, gateContext)
          .catch((err: unknown) => {
            logger.error(
              `Failed to route approval request for feature ${featureId} at gate ${nextPhase}:`,
              err
            );
          });
      }

      logger.info(
        `Pipeline held at gate before ${nextPhase} for feature ${featureId} (mode: ${gateMode})`
      );
      return { advanced: false, phase: currentPhase, held: true };
    }

    // Advance to next phase
    await this.enterPhase(projectPath, featureId, nextPhase, 'auto');
    return { advanced: true, phase: nextPhase, held: false };
  }

  /**
   * Resolve a gate hold — called by user action or system automation.
   */
  async resolveGate(
    projectPath: string,
    featureId: string,
    action: 'advance' | 'reject',
    resolvedBy: 'user' | 'system' = 'user'
  ): Promise<boolean> {
    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature?.pipelineState?.awaitingGate) {
      logger.warn(`Cannot resolve gate: feature ${featureId} is not awaiting a gate`);
      return false;
    }

    const { pipelineState } = feature;
    const { branch, currentPhase } = pipelineState;
    // Use stored gated phase (correct) instead of currentPhase (previous phase)
    const gatePhase = pipelineState.awaitingGatePhase ?? this.getNextPhase(currentPhase, branch);
    const now = new Date().toISOString();

    this.events.emit('pipeline:gate-resolved', {
      featureId,
      projectPath,
      phase: gatePhase ?? currentPhase,
      branch,
      resolvedBy,
      action,
      timestamp: now,
      pipelineState,
    });

    if (action === 'reject') {
      // On reject, mark gate as not awaiting but don't advance
      pipelineState.awaitingGate = false;
      pipelineState.awaitingGatePhase = null;
      pipelineState.gateWaitingSince = undefined;
      await this.featureLoader.update(projectPath, featureId, { pipelineState });
      logger.info(`Gate rejected for feature ${featureId} at ${gatePhase ?? currentPhase}`);
      return true;
    }

    // Advance past the gate
    pipelineState.awaitingGate = false;
    pipelineState.awaitingGatePhase = null;
    pipelineState.gateWaitingSince = undefined;
    if (gatePhase) {
      await this.enterPhase(
        projectPath,
        featureId,
        gatePhase,
        resolvedBy === 'user' ? 'user' : 'auto'
      );
    }

    return true;
  }

  /**
   * Override: jump a feature to a specific phase manually.
   */
  async overridePhase(
    projectPath: string,
    featureId: string,
    targetPhase: PipelinePhase
  ): Promise<boolean> {
    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature?.pipelineState) {
      logger.warn(`Cannot override: feature ${featureId} has no pipeline state`);
      return false;
    }

    await this.enterPhase(projectPath, featureId, targetPhase, 'user', 'Manual phase override');
    return true;
  }

  /**
   * Get pipeline status for a feature.
   */
  async getStatus(projectPath: string, featureId: string): Promise<PipelineState | null> {
    const feature = await this.featureLoader.get(projectPath, featureId);
    return feature?.pipelineState ?? null;
  }

  /**
   * Get all active pipelines across all projects.
   */
  getActivePipelines(): Map<string, string> {
    return new Map(this.activePipelines);
  }

  /**
   * Get aggregated analytics for the pipeline system.
   * Returns real-time metrics from in-memory tracking.
   */
  getAnalytics(): {
    activePipelines: number;
    completedToday: number;
    avgDurationMinutes: number;
    gateHoldRate: number;
    phaseBreakdown: Array<{
      phase: string;
      avgDurationMs: number;
      successRate: number;
      gateHoldCount: number;
    }>;
  } {
    // Prune completedToday entries older than 24h
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.completedToday = this.completedToday.filter((c) => c.completedAt > dayAgo);

    const completedCount = this.completedToday.length;
    const avgDurationMs =
      completedCount > 0
        ? this.completedToday.reduce((sum, c) => sum + c.durationMs, 0) / completedCount
        : 0;

    const gateHoldRate =
      this.gateStats.evaluations > 0 ? this.gateStats.holds / this.gateStats.evaluations : 0;

    // Build per-phase breakdown
    const phaseBreakdown = PIPELINE_PHASES.map((phase) => {
      const durations = this.phaseDurations.get(phase) ?? [];
      const avg =
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
      return {
        phase,
        avgDurationMs: Math.round(avg),
        successRate: durations.length > 0 ? 1.0 : 0, // All tracked phases completed successfully
        gateHoldCount: 0, // Gate holds tracked globally, not per-phase yet
      };
    }).filter((p) => p.avgDurationMs > 0); // Only include phases with data

    return {
      activePipelines: this.activePipelines.size,
      completedToday: completedCount,
      avgDurationMinutes: avgDurationMs / 60_000,
      gateHoldRate,
      phaseBreakdown,
    };
  }

  /**
   * Cleanup and stop listening to events.
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.activePipelines.clear();
    this.phaseStartTimes.clear();
    logger.info('PipelineOrchestrator destroyed');
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private setupEventListeners(): void {
    const subscription = this.events.subscribe(((type: EventType, payload: unknown) => {
      // Handle event-to-phase mapping
      const mapping = EVENT_PHASE_MAP[type];
      if (mapping) {
        this.handlePhaseEvent(type, payload as Record<string, unknown>, mapping).catch((err) => {
          logger.error(`Error handling pipeline event ${type}:`, err);
        });
      }

      // Handle signal intake to initiate pipelines
      if (type === 'authority:idea-injected') {
        this.handleIdeaInjected(payload as Record<string, unknown>).catch((err) => {
          logger.error('Error handling idea-injected for pipeline:', err);
        });
      }

      if (type === 'authority:gtm-signal-received') {
        this.handleGtmSignal(payload as Record<string, unknown>).catch((err) => {
          logger.error('Error handling gtm-signal for pipeline:', err);
        });
      }

      if (type === ('pipeline:phase-sync' as EventType)) {
        this.handlePhaseSync(payload as Record<string, unknown>).catch((err) => {
          logger.error('Error handling pipeline:phase-sync:', err);
        });
      }
    }) as EventCallback);

    this.unsubscribe = subscription.unsubscribe;
  }

  /**
   * Handle a phase-sync event from the Lead Engineer state machine.
   * Called when the LE transitions to REVIEW, MERGE, DEPLOY, or DONE.
   * Advances the 9-phase pipeline model to stay in sync with actual progress.
   */
  private async handlePhaseSync(payload: Record<string, unknown>): Promise<void> {
    const featureId = payload.featureId as string | undefined;
    const projectPath = payload.projectPath as string | undefined;

    if (!featureId || !projectPath) {
      logger.warn('pipeline:phase-sync: missing featureId or projectPath, ignoring');
      return;
    }

    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature?.pipelineState) {
      logger.debug(`pipeline:phase-sync: feature ${featureId} has no pipeline state, skipping`);
      return;
    }

    logger.info(
      `pipeline:phase-sync: advancing pipeline for feature ${featureId} (LE→${payload.toState})`
    );
    await this.advancePhase(projectPath, featureId);
  }

  private async handleIdeaInjected(payload: Record<string, unknown>): Promise<void> {
    const featureId = payload.featureId as string | undefined;
    const projectPath = payload.projectPath as string | undefined;
    const title = payload.title as string | undefined;

    if (!featureId || !projectPath) return;

    // Only initiate if feature doesn't already have pipeline state
    const feature = await this.featureLoader.get(projectPath, featureId);
    if (feature && !feature.pipelineState) {
      await this.initiate(projectPath, featureId, 'ops', title ?? feature.title);
    }
  }

  private async handleGtmSignal(payload: Record<string, unknown>): Promise<void> {
    const featureId = payload.featureId as string;
    const projectPath = payload.projectPath as string;
    const title = payload.title as string | undefined;

    const feature = await this.featureLoader.get(projectPath, featureId);
    if (feature && !feature.pipelineState) {
      await this.initiate(projectPath, featureId, 'gtm', title ?? feature.title);
    }
  }

  private async handlePhaseEvent(
    eventType: string,
    payload: Record<string, unknown>,
    mapping: { phase: PipelinePhase; action: 'entered' | 'completed'; branch?: PipelineBranch }
  ): Promise<void> {
    const featureId = payload.featureId as string | undefined;
    if (!featureId) return;

    const projectPath =
      this.activePipelines.get(featureId) ?? (payload.projectPath as string | undefined);
    if (!projectPath) return;

    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature?.pipelineState) return;

    // Check branch match if mapping specifies a branch
    if (mapping.branch && feature.pipelineState.branch !== mapping.branch) return;

    if (mapping.action === 'entered') {
      // If the phase being entered matches the next expected phase, update
      const nextPhase = this.getNextPhase(
        feature.pipelineState.currentPhase,
        feature.pipelineState.branch
      );
      if (nextPhase === mapping.phase) {
        await this.enterPhase(
          projectPath,
          featureId,
          mapping.phase,
          'system',
          `Detected via ${eventType}`
        );
      }
    } else if (mapping.action === 'completed') {
      // Phase completed — try to advance (skip if already awaiting a gate)
      if (
        feature.pipelineState.currentPhase === mapping.phase &&
        !feature.pipelineState.awaitingGate
      ) {
        await this.advancePhase(projectPath, featureId);
      }
    }
  }

  private async enterPhase(
    projectPath: string,
    featureId: string,
    phase: PipelinePhase,
    triggeredBy: 'auto' | 'user' | 'system',
    reason?: string
  ): Promise<void> {
    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature?.pipelineState) return;

    const { pipelineState } = feature;
    const now = new Date().toISOString();
    const previousPhase = pipelineState.currentPhase;

    // Update state
    pipelineState.currentPhase = phase;
    pipelineState.awaitingGate = false;
    pipelineState.awaitingGatePhase = null;
    pipelineState.gateWaitingSince = undefined;
    pipelineState.phaseHistory.push({
      from: previousPhase,
      to: phase,
      timestamp: now,
      triggeredBy,
      reason,
    });

    // Create Langfuse span for the new phase
    const langfuse = getLangfuseInstance();
    if (langfuse.isAvailable() && pipelineState.traceId) {
      const spanId = randomUUID();
      langfuse.createSpan({
        traceId: pipelineState.traceId,
        id: spanId,
        name: `phase:${phase}`,
        metadata: { phase, branch: pipelineState.branch, triggeredBy },
      });
      if (!pipelineState.phaseSpanIds) pipelineState.phaseSpanIds = {};
      pipelineState.phaseSpanIds[phase] = spanId;
    }

    // Save state
    await this.featureLoader.update(projectPath, featureId, { pipelineState });
    this.activePipelines.set(featureId, projectPath);
    this.phaseStartTimes.set(`${featureId}:${phase}`, Date.now());

    // Emit events
    this.events.emit('pipeline:phase-entered', {
      featureId,
      projectPath,
      phase,
      branch: pipelineState.branch,
      timestamp: now,
      pipelineState,
    });

    logger.info(`Feature ${featureId} entered phase ${phase} (${pipelineState.branch})`, {
      from: previousPhase,
      triggeredBy,
    });

    // Active dispatch: call registered processor for this phase
    await this.dispatchPhase(projectPath, featureId, phase, pipelineState.branch);
  }

  /**
   * Dispatch a phase to its registered processor.
   * If a processor is registered and has an executePhase method, call it.
   * Otherwise, the phase relies on existing event-driven behavior.
   */
  private async dispatchPhase(
    projectPath: string,
    featureId: string,
    phase: PipelinePhase,
    branch: PipelineBranch
  ): Promise<void> {
    const processorRole = PHASE_PROCESSOR_MAP[phase];
    if (!processorRole) return; // No processor for this phase

    // For RESEARCH and SPEC phases, use the branch-specific processor
    const role = processorRole === 'ops' && branch === 'gtm' ? 'gtm' : processorRole;
    const processor = this.processors.get(role);
    if (!processor) return; // No processor registered for this role

    try {
      logger.info(`[Active dispatch] ${role}.executePhase(${phase}) for feature ${featureId}`);
      await processor.executePhase(projectPath, featureId, phase);
    } catch (error) {
      logger.error(`[Active dispatch] Failed to execute phase ${phase} via ${role}:`, error);
    }
  }

  private endPhaseSpan(
    pipelineState: PipelineState,
    phase: PipelinePhase,
    featureId: string
  ): void {
    const langfuse = getLangfuseInstance();
    const spanId = pipelineState.phaseSpanIds?.[phase];
    if (langfuse.isAvailable() && pipelineState.traceId && spanId) {
      // End the span by creating an update with endTime
      langfuse.createSpan({
        traceId: pipelineState.traceId,
        id: spanId,
        name: `phase:${phase}`,
        endTime: new Date(),
        metadata: { phase, completed: true, featureId },
      });
    }
  }

  private getNextPhase(currentPhase: PipelinePhase, branch: PipelineBranch): PipelinePhase | null {
    const currentIndex = PIPELINE_PHASES.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex === PIPELINE_PHASES.length - 1) {
      return null;
    }

    // Walk forward, skipping phases that don't apply to this branch
    for (let i = currentIndex + 1; i < PIPELINE_PHASES.length; i++) {
      const candidate = PIPELINE_PHASES[i];
      if (branch === 'gtm' && GTM_SKIP_PHASES.includes(candidate)) {
        continue;
      }
      return candidate;
    }

    return null;
  }

  private async getGateMode(
    projectPath: string,
    featureId: string,
    phase: PipelinePhase,
    branch: PipelineBranch,
    pipelineState: PipelineState
  ): Promise<GateMode> {
    // Per-feature gate overrides take priority
    if (pipelineState.gateOverrides?.[phase]) {
      return pipelineState.gateOverrides[phase]!;
    }

    // Then check project workflow settings
    try {
      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      if (projectSettings.workflow?.gates?.[branch]?.[phase]) {
        return projectSettings.workflow.gates[branch][phase];
      }
    } catch {
      // Fall through to global defaults
    }

    // Default gate config
    return DEFAULT_PIPELINE_GATES[branch][phase];
  }

  private async evaluateGate(
    gateMode: GateMode,
    featureId: string,
    phase: PipelinePhase
  ): Promise<'proceed' | 'hold'> {
    if (gateMode === 'auto') return 'proceed';
    if (gateMode === 'manual') return 'hold';

    // 'review' mode: auto-proceed if clean, hold if issues detected
    // For SPEC_REVIEW, always hold (requires human review of PRD/draft)
    if (phase === 'SPEC_REVIEW') return 'hold';

    // For VERIFY, always hold in review mode — requires human approval before advancing
    if (phase === 'VERIFY') return 'hold';

    // Default to proceed for review gates on other phases
    return 'proceed';
  }
}
