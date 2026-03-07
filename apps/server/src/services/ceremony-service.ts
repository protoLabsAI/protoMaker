/**
 * CeremonyService — event-driven orchestrator for LangGraph ceremony flows.
 *
 * Replaces the ceremony class hierarchy (CeremonyBase → StandupCeremony →
 * RetroCeremony → ProjectRetroCeremony) with a flat class that subscribes to
 * the same events and invokes the appropriate LangGraph flow factory functions.
 *
 * Public interface is identical to the old hierarchy so consumers
 * (routes, services.ts, engine routes, integration-service) require no changes.
 */

import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { createLogger } from '@protolabsai/utils';
import { secureFs, getProjectDir, getDataDirectory } from '@protolabsai/platform';
import { ChatAnthropic } from '@langchain/anthropic';
import { createStandupFlow, createRetroFlow, createProjectRetroFlow } from '@protolabsai/flows';
import type { CeremonyState } from '@protolabsai/types';
import { flowRegistry } from './automation-service.js';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import type { MetricsService } from './metrics-service.js';
import type { CeremonyAuditLogService } from './ceremony-audit-service.js';
import type { SchedulerService } from './scheduler-service.js';
import { transition } from './ceremony-state-machine.js';
import { projectArtifactService } from './project-artifact-service.js';

const logger = createLogger('CeremonyService');

const CEREMONY_STATE_FILE = 'ceremony-state.json';
const DEFAULT_STANDUP_CADENCE = '0 9 * * 1';

// ---------------------------------------------------------------------------
// Minimal event payload shapes (mirrors the original ceremony-base.ts types)
// ---------------------------------------------------------------------------

interface MilestoneEventPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  milestoneTitle: string;
  milestoneNumber: number;
  featureCount?: number;
  totalCostUsd?: number;
  failureCount?: number;
  prUrls?: string[];
  featureSummaries?: Array<{
    id: string;
    title: string;
    status: string;
    costUsd: number;
    prUrl?: string;
    failureCount?: number;
  }>;
}

interface ProjectCompletedPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  totalMilestones: number;
  totalFeatures: number;
  totalCostUsd: number;
  failureCount: number;
  milestoneSummaries: Array<{
    milestoneTitle: string;
    featureCount: number;
    costUsd: number;
  }>;
}

interface ProjectLifecycleLaunchedPayload {
  projectPath: string;
  projectSlug: string;
  featuresInBacklog: number;
  autoModeStarted: boolean;
}

interface CeremonyFiredPayload {
  type: string;
  projectSlug: string;
  projectPath: string;
  milestoneSlug?: string;
  remainingMilestones?: number;
}

// ---------------------------------------------------------------------------
// EventEmitter-based discordBot adapter
// Satisfies StandupDiscordBot / RetroDiscordBot structural interfaces without
// a hard dependency on DiscordBotService.
// ---------------------------------------------------------------------------

function createDiscordAdapter(emitter: EventEmitter) {
  return {
    sendMessage: async (channelId: string, content: string): Promise<{ id: string }> => {
      emitter.emit('integration:discord', {
        channelId,
        content,
        action: 'send_message',
      });
      return { id: '' };
    },
  };
}

// ---------------------------------------------------------------------------
// CeremonyService
// ---------------------------------------------------------------------------

export class CeremonyService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private projectService: ProjectService | null = null;
  private auditLog: CeremonyAuditLogService | null = null;
  private schedulerService: SchedulerService | null = null;
  private unsubscribe: (() => void) | null = null;

  // Observability counters (same shape as old CeremonyBase.ceremonyCounts)
  private ceremonyCounts = {
    epicKickoff: 0,
    standup: 0,
    milestoneRetro: 0,
    epicDelivery: 0,
    contentBrief: 0,
    projectRetro: 0,
    postProjectDocs: 0,
    discordPostFailures: 0,
  };
  private lastCeremonyAt: string | null = null;

  // Reflection observability state
  private lastReflection: {
    projectTitle: string;
    projectSlug: string;
    completedAt: string;
  } | null = null;
  private reflectionCount = 0;
  private activeReflection: string | null = null;

  // Dedup guard for project retros
  private processedProjects = new Set<string>();
  private dataDir: string | null = null;

  private getLedgerPath(): string | null {
    const dir = this.dataDir ?? getDataDirectory();
    if (!dir) return null;
    return path.join(dir, 'ledger', 'ceremony-processed.jsonl');
  }

  private async loadLedger(): Promise<void> {
    const ledgerPath = this.getLedgerPath();
    if (!ledgerPath) return;

    if (!fs.existsSync(ledgerPath)) {
      logger.debug('CeremonyService: no existing ledger file, starting fresh');
      return;
    }

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(ledgerPath, 'utf-8'),
        crlfDelay: Infinity,
      });

      let loaded = 0;
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as { key: string; timestamp: string };
          if (entry.key) {
            this.processedProjects.add(entry.key);
            loaded++;
          }
        } catch {
          // skip malformed lines
        }
      }

      logger.debug(`CeremonyService: loaded ${loaded} processed project keys from ledger`);
    } catch (err) {
      logger.warn('CeremonyService: failed to load ledger:', err);
    }
  }

  private appendLedgerEntry(key: string): void {
    const ledgerPath = this.getLedgerPath();
    if (!ledgerPath) return;

    const entry = { key, timestamp: new Date().toISOString() };
    const line = JSON.stringify(entry) + '\n';

    void (async () => {
      try {
        await fs.promises.mkdir(path.dirname(ledgerPath), { recursive: true });
        await fs.promises.appendFile(ledgerPath, line, 'utf-8');
      } catch (err) {
        logger.error('CeremonyService: failed to write ledger entry:', err);
      }
    })();
  }

  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    projectService: ProjectService,
    _metricsService: MetricsService,
    dataDir?: string
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.projectService = projectService;
    this.dataDir = dataDir ?? null;

    // Register ceremony flow factories in the global FlowRegistry so that
    // AutomationService.executeAutomation() can resolve them by flowId without
    // throwing "Flow not registered: standup-flow" (or retro-flow / project-retro-flow).
    // The real execution is handled event-driven inside this service; these factories
    // serve as registry stubs so the automation dispatch layer finds the entries.
    flowRegistry.register('standup-flow', async (_modelConfig) => {
      logger.info('standup-flow: execution handled via ceremony event system');
    });
    flowRegistry.register('retro-flow', async (_modelConfig) => {
      logger.info('retro-flow: execution handled via ceremony event system');
    });
    flowRegistry.register('project-retro-flow', async (_modelConfig) => {
      logger.info('project-retro-flow: execution handled via ceremony event system');
    });

    // Load persisted dedup state before subscribing to events
    void this.loadLedger();

    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'milestone:started') {
        this.handleMilestoneStarted(payload as MilestoneEventPayload).catch((err) =>
          logger.warn('Standup flow error:', err)
        );
      } else if (type === 'milestone:completed') {
        this.handleMilestoneCompleted(payload as MilestoneEventPayload).catch((err) =>
          logger.warn('Retro flow error:', err)
        );
      } else if (type === 'project:completed') {
        this.handleProjectCompleted(payload as ProjectCompletedPayload).catch((err) =>
          logger.warn('Project retro flow error:', err)
        );
      } else if (type === 'ceremony:fired') {
        this.handleCeremonyFired(payload as CeremonyFiredPayload).catch((err) =>
          logger.warn('Ceremony fired state update error:', err)
        );
      } else if (type === 'project:lifecycle:launched') {
        this.handleProjectLifecycleLaunched(payload as ProjectLifecycleLaunchedPayload).catch(
          (err) => logger.warn('Project lifecycle launched error:', err)
        );
      } else if (type === ('ceremony:trigger-requested' as string)) {
        this.handleCeremonyTriggerRequested(
          payload as {
            projectPath: string;
            projectSlug: string;
            ceremonyType: string;
            milestoneSlug?: string;
          }
        ).catch((err) => logger.warn('Ceremony trigger-requested error:', err));
      }
    });

    logger.info('Ceremony service initialized (LangGraph flows)');
  }

  setAuditLog(auditLog: CeremonyAuditLogService): void {
    this.auditLog = auditLog;
  }

  setSchedulerService(schedulerService: SchedulerService): void {
    this.schedulerService = schedulerService;
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.settingsService = null;
    this.featureLoader = null;
    this.projectService = null;
  }

  getStatus(): {
    counts: Record<string, number>;
    total: number;
    lastCeremonyAt: string | null;
  } {
    const total = Object.values(this.ceremonyCounts).reduce((a, b) => a + b, 0);
    return { counts: { ...this.ceremonyCounts }, total, lastCeremonyAt: this.lastCeremonyAt };
  }

  getReflectionStatus(): {
    active: boolean;
    activeProject: string | null;
    reflectionCount: number;
    lastReflection: { projectTitle: string; projectSlug: string; completedAt: string } | null;
  } {
    return {
      active: this.activeReflection !== null,
      activeProject: this.activeReflection,
      reflectionCount: this.reflectionCount,
      lastReflection: this.lastReflection,
    };
  }

  clearProcessedProject(projectPath: string, projectSlug: string): void {
    const key = `${projectPath}:${projectSlug}`;
    this.processedProjects.delete(key);
    logger.info(`Cleared processed project: ${projectSlug}`);
  }

  // ---------------------------------------------------------------------------
  // CeremonyState persistence
  // ---------------------------------------------------------------------------

  private getCeremonyStatePath(projectPath: string, projectSlug: string): string {
    return path.join(getProjectDir(projectPath, projectSlug), CEREMONY_STATE_FILE);
  }

  async getCeremonyState(projectPath: string, projectSlug: string): Promise<CeremonyState> {
    const filePath = this.getCeremonyStatePath(projectPath, projectSlug);
    try {
      const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
      return JSON.parse(content) as CeremonyState;
    } catch {
      // File missing or unreadable — create default awaiting_kickoff state
      const defaultState: CeremonyState = {
        phase: 'awaiting_kickoff',
        projectPath,
        projectSlug,
        lastStandup: '',
        lastRetro: '',
        standupCadence: DEFAULT_STANDUP_CADENCE,
        history: [],
      };
      await this.saveCeremonyState(projectPath, projectSlug, defaultState);
      return defaultState;
    }
  }

  private async saveCeremonyState(
    projectPath: string,
    projectSlug: string,
    state: CeremonyState
  ): Promise<void> {
    const projectDir = getProjectDir(projectPath, projectSlug);
    // Ensure the directory exists (project dir under .automaker/projects/{slug})
    await secureFs.mkdir(projectDir, { recursive: true });
    const filePath = path.join(projectDir, CEREMONY_STATE_FILE);
    await secureFs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  private async applyTransition(
    projectPath: string,
    projectSlug: string,
    event: string,
    payload: unknown
  ): Promise<CeremonyState | null> {
    try {
      const current = await this.getCeremonyState(projectPath, projectSlug);
      const next = transition(current, event, payload);
      if (next !== current) {
        await this.saveCeremonyState(projectPath, projectSlug, next);
        logger.debug(`CeremonyState [${projectSlug}]: ${current.phase} → ${next.phase} (${event})`);
      }
      return next;
    } catch (err) {
      logger.warn(
        `CeremonyState persistence failed for ${projectSlug} on ${event}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private event handlers — delegate to LangGraph flows
  // ---------------------------------------------------------------------------

  /**
   * Resolve the ceremony Discord channel ID.
   * Prefers DiscordIntegrationConfig.channels.ceremonies, falls back to CeremonySettings.discordChannelId.
   */
  private async getCeremonyChannelId(projectPath: string): Promise<string | undefined> {
    if (!this.settingsService) return undefined;
    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const discordConfig = projectSettings.integrations?.discord;
    const ceremonySettings = projectSettings.ceremonySettings;
    return discordConfig?.channels?.ceremonies || ceremonySettings?.discordChannelId;
  }

  private async handleProjectLifecycleLaunched(
    payload: ProjectLifecycleLaunchedPayload
  ): Promise<void> {
    const { projectPath, projectSlug } = payload;

    // Transition state machine: awaiting_kickoff → milestone_active
    await this.applyTransition(projectPath, projectSlug, 'project:lifecycle:launched', payload);

    // Register standup scheduler task
    if (this.schedulerService) {
      try {
        const state = await this.getCeremonyState(projectPath, projectSlug);
        const taskId = `pm-standup-${projectSlug}`;
        const cadence = state.standupCadence || DEFAULT_STANDUP_CADENCE;

        await this.schedulerService.registerTask(
          taskId,
          `PM Standup: ${projectSlug}`,
          cadence,
          () => {
            this.emitter?.emit('milestone:started', {
              projectPath,
              projectSlug,
              projectTitle: projectSlug,
              milestoneTitle: 'Standup',
              milestoneNumber: 0,
            });
          },
          true
        );
        logger.info(`Registered standup task ${taskId} with cadence ${cadence}`);
      } catch (err) {
        logger.warn(
          `Failed to register standup task for ${projectSlug}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  private async handleMilestoneStarted(payload: MilestoneEventPayload): Promise<void> {
    if (!this.projectService || !this.settingsService || !this.emitter) return;

    const { projectPath, projectSlug, projectTitle, milestoneTitle, milestoneNumber } = payload;

    // Update milestone tracking in state (non-fatal if persistence fails)
    this.getCeremonyState(projectPath, projectSlug)
      .then(async (state) => {
        if (state.phase === 'milestone_active' || state.phase === 'awaiting_kickoff') {
          const milestoneSlugComputed = milestoneTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const updated: CeremonyState = { ...state, currentMilestone: milestoneSlugComputed };
          await this.saveCeremonyState(projectPath, projectSlug, updated);
        }
      })
      .catch((err) => {
        logger.warn(
          `CeremonyState milestone tracking failed for ${projectSlug}: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const ceremonySettings = projectSettings.ceremonySettings;
    if (!ceremonySettings?.enabled) {
      logger.debug('Ceremonies disabled, skipping standup');
      return;
    }
    const discordChannelId = await this.getCeremonyChannelId(projectPath);
    if (!discordChannelId) {
      logger.debug('No Discord channel configured, skipping standup');
      return;
    }

    const milestoneSlug = milestoneTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    logger.info(`Running standup flow for milestone "${milestoneTitle}" in ${projectTitle}`);
    this.ceremonyCounts.standup++;
    this.lastCeremonyAt = new Date().toISOString();

    const correlationId = `standup-${projectSlug}-${milestoneSlug}-${Date.now()}`;
    try {
      const modelId = ceremonySettings.retroModel?.model ?? 'claude-sonnet-4-6';
      const model = new ChatAnthropic({ model: modelId });
      const flow = createStandupFlow({
        projectService: this.projectService,
        model,
        discordBot: createDiscordAdapter(this.emitter),
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
      });
      await flow.invoke({});
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'standup',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'delivered',
        payload: {
          title: `Standup: ${milestoneTitle}`,
          summary: `Milestone ${milestoneNumber} standup for ${projectTitle}`,
        },
      });
      this.emitter?.emit('ceremony:fired', {
        type: 'standup',
        projectSlug,
        milestoneSlug,
        projectPath,
      });
    } catch (err) {
      this.ceremonyCounts.discordPostFailures++;
      logger.warn(`Standup flow failed: ${err instanceof Error ? err.message : String(err)}`);
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'standup',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        payload: { title: `Standup: ${milestoneTitle}` },
      });
    }
  }

  private async handleMilestoneCompleted(payload: MilestoneEventPayload): Promise<void> {
    if (!this.featureLoader || !this.settingsService || !this.emitter) return;

    const { projectPath, projectSlug, projectTitle, milestoneTitle, milestoneNumber } = payload;

    // State transition: milestone_active → milestone_retro
    await this.applyTransition(projectPath, projectSlug, 'milestone:completed', payload);

    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const ceremonySettings = projectSettings.ceremonySettings;
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableMilestoneUpdates) {
      logger.debug('Milestone retros disabled, skipping');
      return;
    }
    const discordChannelId = await this.getCeremonyChannelId(projectPath);
    if (!discordChannelId) {
      logger.debug('No Discord channel configured, skipping retro');
      return;
    }

    const milestoneSlug = milestoneTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    logger.info(`Running retro flow for milestone "${milestoneTitle}" in ${projectTitle}`);
    this.ceremonyCounts.milestoneRetro++;
    this.lastCeremonyAt = new Date().toISOString();

    const correlationId = `retro-${projectSlug}-${milestoneSlug}-${Date.now()}`;
    try {
      const modelId = ceremonySettings.retroModel?.model ?? 'claude-sonnet-4-6';
      const model = new ChatAnthropic({ model: modelId });
      const flow = createRetroFlow({
        featureLoader: this.featureLoader,
        model,
        discordBot: createDiscordAdapter(this.emitter),
        projectPath,
        projectSlug,
        milestoneSlug,
        milestoneTitle,
        milestoneNumber,
        projectTitle,
        discordChannelId,
      });
      await flow.invoke({});

      // Persist ceremony report artifact
      void projectArtifactService
        .saveArtifact(projectPath, projectSlug, 'ceremony-report', {
          ceremonyType: 'milestone_retro',
          milestoneSlug,
          milestoneTitle,
          milestoneNumber,
          projectTitle,
          completedAt: new Date().toISOString(),
        })
        .catch((err) => {
          logger.warn(
            `Failed to save milestone retro artifact for ${projectSlug}: ${err instanceof Error ? err.message : String(err)}`
          );
        });

      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'milestone_retro',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'delivered',
        payload: {
          title: `Retro: ${milestoneTitle}`,
          summary: `Milestone ${milestoneNumber} retro for ${projectTitle}`,
        },
      });
      this.emitter?.emit('ceremony:fired', {
        type: 'milestone_retro',
        projectSlug,
        milestoneSlug,
        projectPath,
      });
    } catch (err) {
      this.ceremonyCounts.discordPostFailures++;
      logger.warn(`Retro flow failed: ${err instanceof Error ? err.message : String(err)}`);
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'milestone_retro',
        projectPath,
        projectSlug,
        milestoneSlug,
        discordChannelId,
        deliveryStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        payload: { title: `Retro: ${milestoneTitle}` },
      });
    }
  }

  private async handleCeremonyFired(payload: CeremonyFiredPayload): Promise<void> {
    const { type, projectPath, projectSlug } = payload;

    let eventKey: string | null = null;
    if (type === 'milestone_retro') {
      eventKey = 'ceremony:fired(retro)';
    } else if (type === 'project_retro') {
      eventKey = 'ceremony:fired(project_retro)';
    }

    if (eventKey) {
      await this.applyTransition(projectPath, projectSlug, eventKey, payload);
    }
  }

  private async handleProjectCompleted(payload: ProjectCompletedPayload): Promise<void> {
    if (!this.featureLoader || !this.settingsService || !this.emitter) return;

    const { projectPath, projectSlug, projectTitle } = payload;

    // State transition: project_retro (if in that phase already from ceremony:fired)
    // or direct transition based on current phase
    await this.applyTransition(projectPath, projectSlug, 'project:completed', payload);

    // Unregister standup scheduler task
    if (this.schedulerService) {
      const taskId = `pm-standup-${projectSlug}`;
      const unregistered = await this.schedulerService.unregisterTask(taskId);
      if (unregistered) {
        logger.info(`Unregistered standup task ${taskId} on project completion`);
      }
    }

    const dedupeKey = `${projectPath}:${projectSlug}`;
    if (this.processedProjects.has(dedupeKey)) {
      logger.debug(`Project retro already processed for ${projectSlug}, skipping`);
      return;
    }

    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    const ceremonySettings = projectSettings.ceremonySettings;
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableProjectRetros) {
      logger.debug('Project retros disabled, skipping');
      return;
    }
    const discordChannelId = await this.getCeremonyChannelId(projectPath);
    if (!discordChannelId) {
      logger.debug('No Discord channel configured, skipping project retro');
      return;
    }

    this.processedProjects.add(dedupeKey);
    this.appendLedgerEntry(dedupeKey);
    this.activeReflection = projectTitle;
    this.ceremonyCounts.projectRetro++;
    this.lastCeremonyAt = new Date().toISOString();
    logger.info(`Running project retro flow for "${projectTitle}"`);

    const correlationId = `project-retro-${projectSlug}-${Date.now()}`;
    try {
      const modelId = ceremonySettings.retroModel?.model ?? 'claude-sonnet-4-6';
      const model = new ChatAnthropic({ model: modelId });
      const flow = createProjectRetroFlow({
        featureLoader: this.featureLoader,
        model,
        discordBot: createDiscordAdapter(this.emitter),
        projectPath,
        projectSlug,
        projectTitle,
        totalMilestones: payload.totalMilestones,
        totalFeatures: payload.totalFeatures,
        discordChannelId,
      });
      await flow.invoke({});

      // Persist ceremony report artifact
      void projectArtifactService
        .saveArtifact(projectPath, projectSlug, 'ceremony-report', {
          ceremonyType: 'project_retro',
          projectTitle,
          totalMilestones: payload.totalMilestones,
          totalFeatures: payload.totalFeatures,
          totalCostUsd: payload.totalCostUsd,
          failureCount: payload.failureCount,
          milestoneSummaries: payload.milestoneSummaries,
          completedAt: new Date().toISOString(),
        })
        .catch((err) => {
          logger.warn(
            `Failed to save project retro artifact for ${projectSlug}: ${err instanceof Error ? err.message : String(err)}`
          );
        });

      this.reflectionCount++;
      this.lastReflection = {
        projectTitle,
        projectSlug,
        completedAt: new Date().toISOString(),
      };
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'project_retro',
        projectPath,
        projectSlug,
        discordChannelId,
        deliveryStatus: 'delivered',
        payload: {
          title: `Project Retro: ${projectTitle}`,
          summary: `${payload.totalMilestones} milestones, ${payload.totalFeatures} features`,
        },
      });
      this.emitter?.emit('ceremony:fired', { type: 'project_retro', projectSlug, projectPath });
    } catch (err) {
      this.ceremonyCounts.discordPostFailures++;
      logger.warn(`Project retro flow failed: ${err instanceof Error ? err.message : String(err)}`);
      this.auditLog?.record({
        id: correlationId,
        timestamp: new Date().toISOString(),
        ceremonyType: 'project_retro',
        projectPath,
        projectSlug,
        discordChannelId,
        deliveryStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        payload: { title: `Project Retro: ${projectTitle}` },
      });
    } finally {
      this.activeReflection = null;
    }
  }

  /**
   * Handle ceremony:trigger-requested events from PM agent tools.
   * Emits the appropriate event that existing handlers already handle.
   */
  private async handleCeremonyTriggerRequested(payload: {
    projectPath: string;
    projectSlug: string;
    ceremonyType: string;
    milestoneSlug?: string;
  }): Promise<void> {
    if (!this.emitter) return;

    const { projectPath, projectSlug, ceremonyType, milestoneSlug } = payload;
    logger.info(
      `Ceremony trigger requested: ${ceremonyType} for ${projectSlug}${milestoneSlug ? ` milestone=${milestoneSlug}` : ''}`
    );

    if (ceremonyType === 'standup') {
      this.emitter.emit('milestone:started', {
        projectPath,
        projectSlug,
        projectTitle: projectSlug,
        milestoneTitle: milestoneSlug ?? 'Standup',
        milestoneNumber: 0,
      });
    } else if (ceremonyType === 'retro') {
      this.emitter.emit('milestone:completed', {
        projectPath,
        projectSlug,
        projectTitle: projectSlug,
        milestoneTitle: milestoneSlug ?? 'Retro',
        milestoneNumber: 0,
      });
    } else if (ceremonyType === 'project-retro') {
      this.emitter.emit('project:completed', {
        projectPath,
        projectSlug,
        projectTitle: projectSlug,
        totalMilestones: 0,
        totalFeatures: 0,
        totalCostUsd: 0,
        failureCount: 0,
        milestoneSummaries: [],
      });
    }
  }
}

// Singleton instance (matches original export shape)
export const ceremonyService = new CeremonyService();
