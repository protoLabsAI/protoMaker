/**
 * Automation Service
 *
 * Manages the automation registry: stores automation definitions, tracks run history,
 * wires cron automations into the SchedulerService, and executes flows on demand.
 *
 * Integrates with the FlowRegistry (a simple Map<string, FlowFactory>) so that
 * each automation references a named flow that is executed with the automation's
 * modelConfig injected.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import { createLogger } from '@protolabs-ai/utils';
import { secureFs } from '@protolabs-ai/platform';
import type { Automation, AutomationRunRecord, AutomationRunStatus } from '@protolabs-ai/types';
import type { SchedulerService } from './scheduler-service.js';
import type { EventEmitter } from '../lib/events.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { FeatureHealthService } from './feature-health-service.js';
import type { DataIntegrityWatchdogService } from './data-integrity-watchdog-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { registerMaintenanceTasks } from './maintenance-tasks.js';

const logger = createLogger('AutomationService');

const AUTOMATIONS_FILE = 'automations.json';
const AUTOMATION_RUNS_FILE = 'automation-runs.json';
const MAX_RUNS_PER_AUTOMATION = 50;

/**
 * Scheduler task ID prefix for automations
 */
const AUTOMATION_TASK_PREFIX = 'automation:';

/**
 * Dependencies required for syncing with the scheduler (same as registerMaintenanceTasks)
 */
export interface SyncWithSchedulerDeps {
  events: EventEmitter;
  autoModeService: AutoModeService;
  featureHealthService: FeatureHealthService;
  integrityWatchdogService: DataIntegrityWatchdogService;
  featureLoader: FeatureLoader;
  settingsService: SettingsService;
}

/**
 * Input for creating an automation via POST /api/automations/create
 */
export interface CreateAutomationInput {
  name: string;
  description?: string;
  flowId: string;
  trigger:
    | { type: 'cron'; expression: string }
    | { type: 'event'; eventType: string }
    | { type: 'webhook'; path: string };
  enabled?: boolean;
  modelConfig?: Record<string, unknown>;
}

/**
 * Input for updating an automation via PUT /api/automations/:id
 */
export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  flowId?: string;
  trigger?:
    | { type: 'cron'; expression: string }
    | { type: 'event'; eventType: string }
    | { type: 'webhook'; path: string };
  enabled?: boolean;
  modelConfig?: Record<string, unknown>;
}

/**
 * Type for a flow factory function stored in the FlowRegistry.
 * Receives the automation's modelConfig and executes the flow.
 */
export type FlowFactory = (modelConfig?: Record<string, unknown>) => Promise<void>;

/**
 * Stored trigger types — mirrors @protolabs-ai/types AutomationTrigger but with
 * a relaxed eventType (string instead of strict EventType union) so that users
 * can persist event-based automations without needing a compile-time EventType match.
 */
type StoredCronTrigger = { type: 'cron'; expression: string };
type StoredEventTrigger = { type: 'event'; eventType: string };
type StoredWebhookTrigger = { type: 'webhook'; path: string };
type StoredTrigger = StoredCronTrigger | StoredEventTrigger | StoredWebhookTrigger;

/**
 * Stored automation record — all fields from @protolabs-ai/types Automation except
 * modelConfig (flexible Record) and trigger (relaxed eventType).
 */
type StoredAutomation = Omit<Automation, 'modelConfig' | 'trigger'> & {
  trigger: StoredTrigger;
  modelConfig?: Record<string, unknown>;
};

/**
 * Global FlowRegistry: maps flowId -> FlowFactory
 *
 * Flows are registered at startup by services that own specific flows.
 * AutomationService.executeAutomation() looks up the factory here.
 */
class FlowRegistry {
  private flows: Map<string, FlowFactory> = new Map();

  register(flowId: string, factory: FlowFactory): void {
    this.flows.set(flowId, factory);
    logger.info(`Registered flow: ${flowId}`);
  }

  unregister(flowId: string): void {
    this.flows.delete(flowId);
  }

  get(flowId: string): FlowFactory | undefined {
    return this.flows.get(flowId);
  }

  list(): string[] {
    return Array.from(this.flows.keys());
  }

  has(flowId: string): boolean {
    return this.flows.has(flowId);
  }
}

/**
 * Singleton FlowRegistry instance — shared across the process
 */
export const flowRegistry = new FlowRegistry();

/**
 * AutomationService
 *
 * Provides CRUD for automations, run history, cron scheduling, and manual execution.
 */
export class AutomationService {
  private readonly schedulerService: SchedulerService;
  private readonly dataDir: string;

  constructor(schedulerService: SchedulerService, dataDir: string) {
    this.schedulerService = schedulerService;
    this.dataDir = dataDir;
  }

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------

  private automationsPath(): string {
    return path.join(this.dataDir, AUTOMATIONS_FILE);
  }

  private runsPath(): string {
    return path.join(this.dataDir, AUTOMATION_RUNS_FILE);
  }

  private async readAutomations(): Promise<StoredAutomation[]> {
    try {
      await secureFs.access(this.automationsPath());
      const raw = (await secureFs.readFile(this.automationsPath(), 'utf-8')) as string;
      return JSON.parse(raw) as StoredAutomation[];
    } catch {
      return [];
    }
  }

  private async writeAutomations(automations: StoredAutomation[]): Promise<void> {
    await secureFs.mkdir(this.dataDir, { recursive: true });
    await secureFs.writeFile(this.automationsPath(), JSON.stringify(automations, null, 2), 'utf-8');
  }

  private async readRuns(): Promise<AutomationRunRecord[]> {
    try {
      await secureFs.access(this.runsPath());
      const raw = (await secureFs.readFile(this.runsPath(), 'utf-8')) as string;
      return JSON.parse(raw) as AutomationRunRecord[];
    } catch {
      return [];
    }
  }

  private async writeRuns(runs: AutomationRunRecord[]): Promise<void> {
    await secureFs.mkdir(this.dataDir, { recursive: true });
    await secureFs.writeFile(this.runsPath(), JSON.stringify(runs, null, 2), 'utf-8');
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async list(): Promise<StoredAutomation[]> {
    return this.readAutomations();
  }

  async get(id: string): Promise<StoredAutomation | undefined> {
    const automations = await this.readAutomations();
    return automations.find((a) => a.id === id);
  }

  async create(input: CreateAutomationInput): Promise<StoredAutomation> {
    const automations = await this.readAutomations();
    const now = new Date().toISOString();
    const automation: StoredAutomation = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      flowId: input.flowId,
      trigger: input.trigger,
      enabled: input.enabled ?? true,
      modelConfig: input.modelConfig,
      createdAt: now,
      updatedAt: now,
    };
    automations.push(automation);
    await this.writeAutomations(automations);

    // If enabled and has a cron trigger, register with scheduler immediately
    if (automation.enabled && automation.trigger.type === 'cron') {
      await this.registerWithScheduler(automation);
    }

    logger.info(`Created automation "${automation.name}" (${automation.id})`);
    return automation;
  }

  async update(id: string, input: UpdateAutomationInput): Promise<StoredAutomation | undefined> {
    const automations = await this.readAutomations();
    const index = automations.findIndex((a) => a.id === id);
    if (index === -1) return undefined;

    const existing = automations[index];
    const updated: StoredAutomation = {
      ...existing,
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    };
    automations[index] = updated;
    await this.writeAutomations(automations);

    // Sync scheduler registration
    const taskId = `${AUTOMATION_TASK_PREFIX}${id}`;
    const existingTask = this.schedulerService.getTask(taskId);

    if (updated.enabled && updated.trigger.type === 'cron') {
      const cronExpression = (updated.trigger as StoredCronTrigger).expression;
      if (existingTask) {
        if (existingTask.cronExpression !== cronExpression) {
          await this.schedulerService.updateTaskSchedule(taskId, cronExpression);
        }
        if (!existingTask.enabled) {
          await this.schedulerService.enableTask(taskId);
        }
      } else {
        await this.registerWithScheduler(updated);
      }
    } else if (!updated.enabled && existingTask) {
      await this.schedulerService.disableTask(taskId);
    } else if (updated.trigger.type !== 'cron' && existingTask) {
      // Changed from cron to non-cron trigger — unregister from scheduler
      await this.schedulerService.unregisterTask(taskId);
    }

    logger.info(`Updated automation "${updated.name}" (${id})`);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const automations = await this.readAutomations();
    const index = automations.findIndex((a) => a.id === id);
    if (index === -1) return false;

    automations.splice(index, 1);
    await this.writeAutomations(automations);

    // Unregister from scheduler
    await this.schedulerService.unregisterTask(`${AUTOMATION_TASK_PREFIX}${id}`);

    logger.info(`Deleted automation ${id}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Run history
  // ---------------------------------------------------------------------------

  async getHistory(automationId: string): Promise<AutomationRunRecord[]> {
    const runs = await this.readRuns();
    return runs
      .filter((r) => r.automationId === automationId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute an automation by ID.
   * Looks up the flow by flowId in the FlowRegistry and runs it with modelConfig injected.
   */
  async executeAutomation(
    id: string,
    triggeredBy: 'scheduler' | 'manual' = 'scheduler'
  ): Promise<AutomationRunRecord> {
    const automation = await this.get(id);
    if (!automation) {
      throw new Error(`Automation not found: ${id}`);
    }

    const factory = flowRegistry.get(automation.flowId);
    if (!factory) {
      throw new Error(`Flow not registered: ${automation.flowId}`);
    }

    const runId = randomUUID();
    const startedAt = new Date().toISOString();

    logger.info(
      `Executing automation "${automation.name}" (${id}), flow: ${automation.flowId}, triggered by: ${triggeredBy}`
    );

    let status: AutomationRunStatus = 'running';
    let error: string | undefined;

    try {
      await factory(automation.modelConfig);
      status = 'success';
    } catch (err) {
      status = 'failure';
      error = err instanceof Error ? err.message : String(err);
      logger.error(`Automation "${automation.name}" (${id}) failed:`, err);
    }

    const completedAt = new Date().toISOString();

    const run: AutomationRunRecord = {
      id: runId,
      automationId: id,
      status,
      startedAt,
      completedAt,
      error,
    };

    await this.appendRun(run);

    return run;
  }

  private async appendRun(run: AutomationRunRecord): Promise<void> {
    const allRuns = await this.readRuns();
    allRuns.push(run);

    // Cap history per automation
    const automationRuns = allRuns.filter((r) => r.automationId === run.automationId);
    if (automationRuns.length > MAX_RUNS_PER_AUTOMATION) {
      const toRemove = automationRuns
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .slice(0, automationRuns.length - MAX_RUNS_PER_AUTOMATION)
        .map((r) => r.id);

      const pruned = allRuns.filter((r) => !toRemove.includes(r.id));
      await this.writeRuns(pruned);
    } else {
      await this.writeRuns(allRuns);
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduler integration
  // ---------------------------------------------------------------------------

  private async registerWithScheduler(automation: StoredAutomation): Promise<void> {
    if (automation.trigger.type !== 'cron') return;

    const cronExpression = (automation.trigger as StoredCronTrigger).expression;
    const taskId = `${AUTOMATION_TASK_PREFIX}${automation.id}`;
    await this.schedulerService.registerTask(
      taskId,
      automation.name,
      cronExpression,
      async () => {
        await this.executeAutomation(automation.id, 'scheduler');
      },
      automation.enabled
    );
  }

  /**
   * Load all automations and sync enabled cron automations with the scheduler.
   * Also registers built-in maintenance tasks.
   *
   * Called from scheduler.module.ts after the scheduler has started, replacing
   * the direct call to registerMaintenanceTasks().
   */
  async syncWithScheduler(deps: SyncWithSchedulerDeps): Promise<void> {
    // Register built-in maintenance tasks (preserves existing scheduled behavior)
    await registerMaintenanceTasks(
      this.schedulerService,
      deps.events,
      deps.autoModeService,
      deps.featureHealthService,
      deps.integrityWatchdogService,
      deps.featureLoader,
      deps.settingsService
    );

    // Register user-defined cron automations
    const automations = await this.readAutomations();
    let registered = 0;
    for (const automation of automations) {
      if (automation.enabled && automation.trigger.type === 'cron') {
        try {
          await this.registerWithScheduler(automation);
          registered++;
        } catch (err) {
          logger.error(
            `Failed to register automation "${automation.name}" (${automation.id}):`,
            err
          );
        }
      }
    }

    logger.info(
      `Automation sync complete: ${registered} user automations registered with scheduler`
    );
  }

  /**
   * Alias for loadAll() semantics — returns all stored automations.
   */
  async loadAll(): Promise<StoredAutomation[]> {
    return this.readAutomations();
  }
}
