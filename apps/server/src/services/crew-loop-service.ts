/**
 * CrewLoopService - Unified crew member scheduling and escalation
 *
 * Manages a registry of crew members (Ava, Frank, GTM, etc.) that run
 * lightweight checks on independent cron schedules. When a check detects
 * problems, the service escalates by spawning the member's agent template
 * via DynamicAgentExecutor.
 *
 * Architecture:
 *   SchedulerService (cron tick)
 *     --> CrewLoopService.runCheck(memberId)
 *       --> member.check(context) — lightweight, in-process, no API calls
 *         --> IF needsEscalation: DynamicAgentExecutor.execute(template, prompt)
 *         --> ELSE: log "ok", emit event, done
 *
 * Adding a new crew member = one file implementing CrewMemberDefinition,
 * then crewLoopService.registerMember(def).
 */

import { createLogger } from '@automaker/utils';
import type { CrewLoopSettings } from '@automaker/types';
import type { SchedulerService } from './scheduler-service.js';
import type { AgentFactoryService } from './agent-factory-service.js';
import type { DynamicAgentExecutor, ExecutionResult } from './dynamic-agent-executor.js';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { FeatureHealthService } from './feature-health-service.js';
import type { HealthMonitorService } from './health-monitor-service.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('CrewLoopService');

// ============================================================================
// Public interfaces
// ============================================================================

/** Context passed to every crew member check function */
export interface CrewCheckContext {
  projectPaths: string[];
  events: EventEmitter;
  featureLoader: FeatureLoader;
  featureHealthService: FeatureHealthService;
  healthMonitorService: HealthMonitorService;
  autoModeService: AutoModeService;
  settingsService: SettingsService;
}

/** Result returned by a crew member's check function */
export interface CrewCheckResult {
  needsEscalation: boolean;
  summary: string;
  severity: 'ok' | 'info' | 'warning' | 'critical';
  findings: Array<{
    type: string;
    message: string;
    severity: string;
    context?: Record<string, unknown>;
  }>;
  metrics?: Record<string, unknown>;
}

/** Definition for a single crew member — this is ALL you need to add a new one */
export interface CrewMemberDefinition {
  /** Unique identifier (used as scheduler task suffix: crew:{id}) */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** RoleRegistryService template name for escalation agent */
  templateName: string;
  /** Default cron schedule */
  defaultSchedule: string;
  /** Whether enabled when no settings override exists */
  enabledByDefault: boolean;
  /** Lightweight in-process check — no API calls */
  check: (ctx: CrewCheckContext) => Promise<CrewCheckResult>;
  /** Build the escalation prompt from check findings */
  buildEscalationPrompt: (result: CrewCheckResult) => string;
  /** Tools allowed during escalation agent execution */
  escalationTools: string[];
}

/** Runtime state for a registered crew member */
export interface CrewMemberState {
  definition: CrewMemberDefinition;
  enabled: boolean;
  schedule: string;
  running: boolean;
  lastCheck?: {
    timestamp: string;
    result: CrewCheckResult;
    durationMs: number;
  };
  lastEscalation?: {
    timestamp: string;
    result: ExecutionResult;
    durationMs: number;
  };
  checkCount: number;
  escalationCount: number;
}

/** Status snapshot for all crew members */
export interface CrewStatus {
  enabled: boolean;
  members: Record<
    string,
    Omit<CrewMemberState, 'definition'> & {
      id: string;
      displayName: string;
      templateName: string;
      defaultSchedule: string;
    }
  >;
}

// ============================================================================
// Service
// ============================================================================

export class CrewLoopService {
  private members = new Map<string, CrewMemberState>();
  private locks = new Set<string>();
  private systemEnabled = true;

  constructor(
    private events: EventEmitter,
    private schedulerService: SchedulerService,
    private agentFactoryService: AgentFactoryService,
    private dynamicAgentExecutor: DynamicAgentExecutor,
    private context: CrewCheckContext,
    private projectPath: string
  ) {}

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  /**
   * Register a crew member definition. Loads settings overrides for
   * enable/schedule from global settings if present.
   */
  async registerMember(def: CrewMemberDefinition): Promise<void> {
    const settings = await this.loadSettings();
    const memberOverride = settings?.members[def.id];

    const state: CrewMemberState = {
      definition: def,
      enabled: memberOverride?.enabled ?? def.enabledByDefault,
      schedule: memberOverride?.schedule ?? def.defaultSchedule,
      running: false,
      checkCount: 0,
      escalationCount: 0,
    };

    this.members.set(def.id, state);
    logger.info(
      `Registered crew member "${def.displayName}" (${def.id}) — ${state.enabled ? 'enabled' : 'disabled'}, schedule: ${state.schedule}`
    );
  }

  /**
   * Register all enabled members as scheduler tasks.
   * Call this once after all members are registered.
   */
  async registerAllWithScheduler(): Promise<void> {
    // Skip crew loops in development — they clog logs and spawn unnecessary agents
    if (process.env.NODE_ENV !== 'production') {
      logger.info('Crew loops disabled in development mode (NODE_ENV !== production)');
      this.systemEnabled = false;
      return;
    }

    const settings = await this.loadSettings();
    if (settings && !settings.enabled) {
      this.systemEnabled = false;
      logger.info('Crew loop system disabled in settings, skipping scheduler registration');
      return;
    }

    let registered = 0;
    for (const [id, state] of this.members) {
      const taskId = `crew:${id}`;
      await this.schedulerService.registerTask(
        taskId,
        `Crew: ${state.definition.displayName}`,
        state.schedule,
        async () => {
          await this.runCheck(id);
        },
        state.enabled
      );
      if (state.enabled) registered++;
    }

    logger.info(`Registered ${registered}/${this.members.size} crew members with scheduler`);
  }

  // --------------------------------------------------------------------------
  // Check execution
  // --------------------------------------------------------------------------

  /**
   * Run a crew member's check. Acquires a per-member lock to prevent
   * overlapping runs of the same member.
   */
  async runCheck(id: string): Promise<CrewCheckResult> {
    const state = this.members.get(id);
    if (!state) {
      throw new Error(`Unknown crew member: ${id}`);
    }

    // Per-member concurrency lock
    if (this.locks.has(id)) {
      logger.info(`Crew member "${id}" check already running, skipping`);
      return {
        needsEscalation: false,
        summary: 'Skipped — previous check still running',
        severity: 'ok',
        findings: [],
      };
    }

    this.locks.add(id);
    state.running = true;
    const checkStart = Date.now();

    this.events.emit('crew:check-started', {
      memberId: id,
      displayName: state.definition.displayName,
      timestamp: new Date().toISOString(),
    });

    try {
      // Refresh project paths from auto-mode
      this.context.projectPaths = this.getKnownProjectPaths();

      // Run the lightweight check
      const result = await state.definition.check(this.context);
      const checkDurationMs = Date.now() - checkStart;

      state.lastCheck = {
        timestamp: new Date().toISOString(),
        result,
        durationMs: checkDurationMs,
      };
      state.checkCount++;

      this.events.emit('crew:check-completed', {
        memberId: id,
        displayName: state.definition.displayName,
        severity: result.severity,
        summary: result.summary,
        needsEscalation: result.needsEscalation,
        findingsCount: result.findings.length,
        durationMs: checkDurationMs,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `[${id}] Check complete: ${result.severity} — ${result.summary} (${checkDurationMs}ms)`
      );

      // Escalate if needed
      if (result.needsEscalation) {
        await this.escalate(id, state, result);
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${id}] Check failed: ${errorMsg}`);

      return {
        needsEscalation: false,
        summary: `Check failed: ${errorMsg}`,
        severity: 'warning',
        findings: [{ type: 'error', message: errorMsg, severity: 'warning' }],
      };
    } finally {
      this.locks.delete(id);
      state.running = false;
    }
  }

  // --------------------------------------------------------------------------
  // Escalation
  // --------------------------------------------------------------------------

  private async escalate(
    id: string,
    state: CrewMemberState,
    result: CrewCheckResult
  ): Promise<void> {
    const escalationStart = Date.now();

    this.events.emit('crew:escalation-started', {
      memberId: id,
      displayName: state.definition.displayName,
      severity: result.severity,
      findingsCount: result.findings.length,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[${id}] Escalating — spawning "${state.definition.templateName}" agent`);

    try {
      const agentConfig = this.agentFactoryService.createFromTemplate(
        state.definition.templateName,
        this.projectPath,
        { tools: state.definition.escalationTools }
      );

      const prompt = state.definition.buildEscalationPrompt(result);

      const execResult = await this.dynamicAgentExecutor.execute(agentConfig, {
        prompt,
        additionalSystemPrompt: `You are responding to an automated crew loop check for "${state.definition.displayName}". Focus on the findings and take appropriate action.`,
      });

      const escalationDurationMs = Date.now() - escalationStart;

      state.lastEscalation = {
        timestamp: new Date().toISOString(),
        result: execResult,
        durationMs: escalationDurationMs,
      };
      state.escalationCount++;

      this.events.emit('crew:escalation-completed', {
        memberId: id,
        displayName: state.definition.displayName,
        success: execResult.success,
        durationMs: escalationDurationMs,
        model: execResult.model,
        timestamp: new Date().toISOString(),
      });

      if (execResult.success) {
        logger.info(`[${id}] Escalation completed successfully in ${escalationDurationMs}ms`);
      } else {
        logger.error(`[${id}] Escalation agent failed: ${execResult.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${id}] Escalation failed: ${errorMsg}`);

      this.events.emit('crew:escalation-completed', {
        memberId: id,
        displayName: state.definition.displayName,
        success: false,
        error: errorMsg,
        durationMs: Date.now() - escalationStart,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // --------------------------------------------------------------------------
  // Runtime controls
  // --------------------------------------------------------------------------

  /** Enable a crew member and its scheduler task */
  async enableMember(id: string): Promise<void> {
    const state = this.members.get(id);
    if (!state) throw new Error(`Unknown crew member: ${id}`);

    state.enabled = true;
    const taskId = `crew:${id}`;

    // Re-register to enable in scheduler
    await this.schedulerService.registerTask(
      taskId,
      `Crew: ${state.definition.displayName}`,
      state.schedule,
      async () => {
        await this.runCheck(id);
      },
      true
    );

    logger.info(`Crew member "${id}" enabled`);
  }

  /** Disable a crew member and its scheduler task */
  async disableMember(id: string): Promise<void> {
    const state = this.members.get(id);
    if (!state) throw new Error(`Unknown crew member: ${id}`);

    state.enabled = false;
    const taskId = `crew:${id}`;

    // Re-register as disabled
    await this.schedulerService.registerTask(
      taskId,
      `Crew: ${state.definition.displayName}`,
      state.schedule,
      async () => {
        await this.runCheck(id);
      },
      false
    );

    logger.info(`Crew member "${id}" disabled`);
  }

  /** Update a crew member's cron schedule */
  async updateSchedule(id: string, cronExpression: string): Promise<void> {
    const state = this.members.get(id);
    if (!state) throw new Error(`Unknown crew member: ${id}`);

    state.schedule = cronExpression;
    const taskId = `crew:${id}`;

    // Re-register with new schedule
    await this.schedulerService.registerTask(
      taskId,
      `Crew: ${state.definition.displayName}`,
      cronExpression,
      async () => {
        await this.runCheck(id);
      },
      state.enabled
    );

    logger.info(`Crew member "${id}" schedule updated to: ${cronExpression}`);
  }

  /** Get status snapshot for all crew members */
  getStatus(): CrewStatus {
    const members: CrewStatus['members'] = {};

    for (const [id, state] of this.members) {
      members[id] = {
        id,
        displayName: state.definition.displayName,
        templateName: state.definition.templateName,
        defaultSchedule: state.definition.defaultSchedule,
        enabled: state.enabled,
        schedule: state.schedule,
        running: state.running,
        lastCheck: state.lastCheck,
        lastEscalation: state.lastEscalation,
        checkCount: state.checkCount,
        escalationCount: state.escalationCount,
      };
    }

    return {
      enabled: this.systemEnabled,
      members,
    };
  }

  /** Get a specific member state */
  getMember(id: string): CrewMemberState | undefined {
    return this.members.get(id);
  }

  /** Get all registered member IDs */
  getMemberIds(): string[] {
    return Array.from(this.members.keys());
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async loadSettings(): Promise<CrewLoopSettings | undefined> {
    try {
      const globalSettings = await this.context.settingsService.getGlobalSettings();
      return globalSettings.crewLoops;
    } catch {
      return undefined;
    }
  }

  private getKnownProjectPaths(): string[] {
    const paths = new Set<string>();
    for (const p of this.context.autoModeService.getActiveAutoLoopProjects()) {
      paths.add(p);
    }
    // Always include the main project path
    if (this.projectPath) {
      paths.add(this.projectPath);
    }
    return Array.from(paths);
  }
}
