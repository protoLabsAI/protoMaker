// Service instantiation: creates all ~60+ services in dependency order and returns ServiceContainer

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLogger } from '@protolabsai/utils';
import { createEventEmitter, type EventEmitter } from '../lib/events.js';

import { AgentService } from '../services/agent-service.js';
import { FeatureLoader } from '../services/feature-loader.js';
import { UserIdentityService } from '../services/user-identity-service.js';
import { AutoModeService } from '../services/auto-mode-service.js';
import { getTerminalService } from '../services/terminal-service.js';
import { SettingsService } from '../services/settings-service.js';
import { ClaudeUsageService } from '../services/claude-usage-service.js';
import { contentFlowService } from '../services/content-flow-service.js';
import { calendarService } from '../services/calendar-service.js';
import { GoogleCalendarSyncService } from '../services/google-calendar-sync-service.js';
import { MCPTestService } from '../services/mcp-test-service.js';
import { getEscalationRouter } from '../services/escalation-router.js';
import { pipelineService } from '../services/pipeline-service.js';
import { MetricsService } from '../services/metrics-service.js';
import { getDevServerService } from '../services/dev-server-service.js';
import { getNotificationService } from '../services/notification-service.js';
import { HITLFormService } from '../services/hitl-form-service.js';
import { getActionableItemService } from '../services/actionable-item-service.js';
import { ActionableItemBridgeService } from '../services/actionable-item-bridge-service.js';
import { getEventHistoryService } from '../services/event-history-service.js';
import { getBriefingCursorService } from '../services/briefing-cursor-service.js';
import { getSchedulerService } from '../services/scheduler-service.js';
import { AutomationService } from '../services/automation-service.js';
import { getHealthMonitorService } from '../services/health-monitor-service.js';
import { integrationService } from '../services/integration-service.js';
import { SignalIntakeService } from '../services/signal-intake-service.js';
import { AuthorityService } from '../services/authority-service.js';
import { CompletionDetectorService } from '../services/completion-detector-service.js';
import { PMAuthorityAgent } from '../services/authority-agents/pm-agent.js';
import { GTMAuthorityAgent } from '../services/authority-agents/gtm-agent.js';
import { ProjMAuthorityAgent } from '../services/authority-agents/projm-agent.js';
import { EMAuthorityAgent } from '../services/authority-agents/em-agent.js';
import { AuditService } from '../services/audit-service.js';
import { PRFeedbackService } from '../services/pr-feedback-service.js';
import { WorktreeLifecycleService } from '../services/worktree-lifecycle-service.js';
import { DiscordBotService } from '../services/discord-bot-service.js';
import { RoleRegistryService } from '../services/role-registry-service.js';
import { SensorRegistryService } from '../services/sensor-registry-service.js';
import { ContextAggregator } from '../services/context-aggregator.js';
import { IntegrationRegistryService } from '../services/integration-registry-service.js';
import {
  registerBuiltInIntegrations,
  wireHealthChecks,
} from '../services/built-in-integrations.js';
import { AgentFactoryService } from '../services/agent-factory-service.js';
import { DynamicAgentExecutor } from '../services/dynamic-agent-executor.js';
import { registerBuiltInTemplates } from '../services/built-in-templates.js';
import { ReconciliationService } from '../services/reconciliation-service.js';
import { GitHubStateChecker } from '../services/github-state-checker.js';
import { PipelineCheckpointService } from '../services/pipeline-checkpoint-service.js';
import { ProjectService } from '../services/project-service.js';
import { getSpecGenerationMonitor } from '../services/spec-generation-monitor.js';
import { FeatureHealthService } from '../services/feature-health-service.js';
import { getAvaGatewayService } from '../services/ava-gateway-service.js';
import { getDiscordService } from '../services/discord-service.js';
import { TriageService } from '../services/triage-service.js';
import { IssueCreationService } from '../services/issue-creation-service.js';
import { EventStreamBuffer } from '../lib/event-stream-buffer.js';
import { AntagonisticReviewService } from '../services/antagonistic-review-service.js';
import { AgentScoringService } from '../services/agent-scoring-service.js';
import { gitWorkflowService } from '../services/git-workflow-service.js';
import { PipelineOrchestrator } from '../services/pipeline-orchestrator.js';
import { TrustTierService } from '../services/trust-tier-service.js';
import { LedgerService } from '../services/ledger-service.js';
import { ArchivalService } from '../services/archival-service.js';
import { KnowledgeStoreService } from '../services/knowledge-store-service.js';
import { DocsUpdateDetector } from '../services/docs-update-detector.js';
import { HeadsdownService } from '../services/headsdown-service.js';
import { AgentDiscordRouter } from '../services/agent-discord-router.js';
import { FactStoreService } from '../services/fact-store-service.js';
import { TrajectoryStoreService } from '../services/trajectory-store-service.js';
import { LeadHandoffService } from '../services/lead-handoff-service.js';
import { ChannelRouter } from '../services/channel-router.js';
import { NotificationRouter } from '../services/notification-router.js';
import { JobExecutorService } from '../services/job-executor-service.js';
import { DoraMetricsService } from '../services/dora-metrics-service.js';
import { FrictionTrackerService } from '../services/friction-tracker-service.js';
import { FailureClassifierService } from '../services/failure-classifier-service.js';
import {
  getReactiveSpawnerService,
  ReactiveSpawnerService,
} from '../services/reactive-spawner-service.js';
import { registerAvaCronTasks } from '../services/ava-cron-tasks.js';

// Services originally loaded via top-level dynamic imports — now static for proper typing
import { ProjectLifecycleService } from '../services/project-lifecycle-service.js';
import { CeremonyAuditLogService } from '../services/ceremony-audit-service.js';
import { CeremonyService, ceremonyService } from '../services/ceremony-service.js';
import { LeadEngineerService } from '../services/lead-engineer-service.js';
import { ContextFidelityService } from '../services/context-fidelity-service.js';
import {
  DataIntegrityWatchdogService,
  getDataIntegrityWatchdogService,
} from '../services/data-integrity-watchdog-service.js';
import { changelogService } from '../services/changelog-service.js';
import { ProjectPMService } from '../services/project-pm-service.js';
import * as projectPmModule from '../services/project-pm.module.js';
import { CrdtSyncService } from '../services/crdt-sync-service.js';
import { AvaChannelService } from '../services/ava-channel-service.js';
import { WorkIntakeService } from '../services/work-intake-service.js';
import { TodoService } from '../services/todo-service.js';
import type { AvaChannelReactorService } from '../services/ava-channel-reactor-service.js';
import type { FleetSchedulerService } from '../services/fleet-scheduler-service.js';

const logger = createLogger('Server:Services');

// Re-export EventEmitter type for consumers
export type { EventEmitter };

/** Fully-typed container of all server services */
export interface ServiceContainer {
  // Constants passed through for downstream module access
  dataDir: string;
  repoRoot: string;

  // Core event bus
  events: EventEmitter;

  // Settings & identity
  settingsService: SettingsService;
  userIdentityService: UserIdentityService;

  // Feature management
  featureLoader: FeatureLoader;
  trustTierService: TrustTierService;

  // Agent infrastructure
  agentService: AgentService;
  roleRegistryService: RoleRegistryService;
  agentFactoryService: AgentFactoryService;

  // Sensor registry
  sensorRegistryService: SensorRegistryService;
  contextAggregator: ContextAggregator;
  dynamicAgentExecutor: DynamicAgentExecutor;
  headsdownService: HeadsdownService;

  // Metrics & ledger
  metricsService: MetricsService;
  ledgerService: LedgerService;
  archivalService: ArchivalService;

  // Calendar & scheduling
  googleCalendarSyncService: GoogleCalendarSyncService;
  calendarService: typeof calendarService;
  schedulerService: ReturnType<typeof getSchedulerService>;
  automationService: AutomationService;
  jobExecutorService: JobExecutorService;

  // Auto-mode
  autoModeService: AutoModeService;
  workIntakeService: WorkIntakeService;
  hitlFormService: HITLFormService;

  // Claude usage
  claudeUsageService: ClaudeUsageService;
  mcpTestService: MCPTestService;

  // Feature health
  featureHealthService: FeatureHealthService;
  healthMonitorService: ReturnType<typeof getHealthMonitorService>;

  // Discord
  discordService: ReturnType<typeof getDiscordService>;
  discordBotService: DiscordBotService;

  // Knowledge
  knowledgeStoreService: KnowledgeStoreService;

  // Escalation
  escalationRouter: ReturnType<typeof getEscalationRouter>;

  // Ava Gateway
  avaGatewayService: ReturnType<typeof getAvaGatewayService>;

  // Integration registry
  integrationRegistryService: IntegrationRegistryService;

  // Review & scoring
  antagonisticReviewService: AntagonisticReviewService;

  // Dev server & notifications
  devServerService: ReturnType<typeof getDevServerService>;
  notificationService: ReturnType<typeof getNotificationService>;
  notificationRouter: NotificationRouter;
  actionableItemService: ReturnType<typeof getActionableItemService>;
  actionableItemBridge: ActionableItemBridgeService;
  integrityWatchdogService: DataIntegrityWatchdogService;

  // Event history & briefing
  eventHistoryService: ReturnType<typeof getEventHistoryService>;
  eventStreamBuffer: EventStreamBuffer;
  briefingCursorService: ReturnType<typeof getBriefingCursorService>;

  // Signal & pipeline
  signalIntakeService: SignalIntakeService;
  pipelineOrchestrator: PipelineOrchestrator;
  pipelineService: typeof pipelineService;
  channelRouter: ChannelRouter;

  // Docs detection
  docsUpdateDetector: DocsUpdateDetector;

  // Authority & audit
  authorityService: AuthorityService;
  auditService: AuditService;
  pmAgent: PMAuthorityAgent;
  gtmAgent: GTMAuthorityAgent;
  emAgent: EMAuthorityAgent;
  projmAgent: ProjMAuthorityAgent;

  // Project management
  projectService: ProjectService;
  projectLifecycleService: ProjectLifecycleService;
  completionDetectorService: CompletionDetectorService;

  // Ceremonies
  ceremonyAuditLog: CeremonyAuditLogService;
  ceremonyService: CeremonyService;

  // Lead Engineer
  leadEngineerService: LeadEngineerService;
  pipelineCheckpointService: PipelineCheckpointService;
  factStoreService: FactStoreService;
  trajectoryStoreService: TrajectoryStoreService;
  leadHandoffService: LeadHandoffService;

  // PR & worktree lifecycle
  prFeedbackService: PRFeedbackService;
  worktreeLifecycleService: WorktreeLifecycleService;
  githubStateChecker: GitHubStateChecker;
  reconciliationService: ReconciliationService;

  // Issue management
  triageService: TriageService;
  issueCreationService: IssueCreationService;

  // Project PM Agent
  projectPmService: ProjectPMService;

  // Discord routing
  agentDiscordRouter: AgentDiscordRouter;

  // Spec monitoring
  specGenerationMonitor: ReturnType<typeof getSpecGenerationMonitor>;

  // Git workflow (singleton)
  gitWorkflowService: typeof gitWorkflowService;

  // Content flow (singleton)
  contentFlowService: typeof contentFlowService;

  // CRDT sync service (multi-instance coordination)
  crdtSyncService: CrdtSyncService;

  // Ava Channel (private multi-instance Ava communication)
  avaChannelService: AvaChannelService;

  // Todo workspace (per-project todo lists synced via CRDT)
  todoService: TodoService;

  // DORA metrics (lead time, deployment frequency, change failure rate, recovery time, rework rate)
  doraMetricsService: DoraMetricsService;

  // Friction tracker (self-improvement loop — recurring failure pattern detection)
  frictionTrackerService: FrictionTrackerService;

  // Reactive spawner (trigger-based agent spawning with rate limiting and circuit breaking)
  reactiveSpawnerService: ReactiveSpawnerService;

  // CRDT document store (set by crdt-store.module, used by dependent modules)
  _crdtStore?: import('@protolabsai/crdt').CRDTStore;

  // CRDT document store cleanup (set by crdt-store.module, called on shutdown)
  _crdtStoreCleanup?: () => Promise<void>;

  // Ava Channel Reactor (set by ava-channel-reactor.module, called on shutdown)
  avaChannelReactorService?: AvaChannelReactorService;

  // Ava Channel Reactor stop function (set by ava-channel-reactor.module, called on shutdown)
  _avaChannelReactorStop?: () => void;

  // Fleet Scheduler (set by ava-channel-reactor.module when hivemind is enabled)
  fleetSchedulerService?: FleetSchedulerService;

  // Drift detection interval (set by wireServices, cleared by shutdown)
  driftCheckInterval: ReturnType<typeof setInterval> | null;
}

/**
 * Instantiate all server services in the correct dependency order.
 * Preserves the exact instantiation order from the original index.ts.
 */
export async function createServices(dataDir: string, repoRoot: string): Promise<ServiceContainer> {
  // Create shared event emitter for streaming
  const events: EventEmitter = createEventEmitter();

  // Settings & identity (created first — injected into most other services)
  const settingsService = new SettingsService(dataDir);
  // Wire settingsService into the contentFlowService singleton for model resolution
  contentFlowService.setSettingsService(settingsService);
  const userIdentityService = new UserIdentityService(settingsService);
  // Features are local to each instance — no CRDT sync.
  const featureLoader = new FeatureLoader();
  featureLoader.setEventEmitter(events);

  // Trust Tier Service for quarantine pipeline
  const trustTierService = new TrustTierService(dataDir);
  const agentService = new AgentService(dataDir, events, settingsService, undefined, featureLoader);
  const metricsService = new MetricsService(featureLoader);
  const doraMetricsService = new DoraMetricsService(featureLoader);

  // Metrics Ledger & Archival
  const ledgerService = new LedgerService(featureLoader, events);
  ledgerService.initialize();
  const archivalService = new ArchivalService(
    featureLoader,
    ledgerService,
    settingsService,
    events
  );
  archivalService.start();

  // Calendar service (singleton wired in wireServices)
  const googleCalendarSyncService = new GoogleCalendarSyncService(settingsService, calendarService);
  const autoModeService = new AutoModeService(events, settingsService);
  const workIntakeService = new WorkIntakeService();
  const hitlFormService = new HITLFormService({
    events,
    followUpFeature: (projectPath, featureId, prompt) =>
      autoModeService.followUpFeature(projectPath, featureId, prompt, undefined, true),
    getKnownProjectPaths: () => {
      try {
        const settingsPath = join(dataDir, 'settings.json');
        const raw = readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(raw);
        return (settings?.projects ?? []).map((p: { path: string }) => p.path).filter(Boolean);
      } catch {
        return [];
      }
    },
    getFeature: (projectPath, featureId) => featureLoader.get(projectPath, featureId),
  });
  const claudeUsageService = new ClaudeUsageService();
  const mcpTestService = new MCPTestService(settingsService);
  const featureHealthService = new FeatureHealthService(featureLoader, autoModeService);
  const discordService = getDiscordService();

  // Knowledge Store Service for chunked retrieval
  const knowledgeStoreService = new KnowledgeStoreService();

  // Escalation Router
  const escalationRouter = getEscalationRouter();

  // Health Monitor Service early with autoRemediate enabled
  const healthMonitorService = getHealthMonitorService(featureLoader, {
    autoRemediate: true,
    checkIntervalMs: 5 * 60 * 1000,
    stuckThresholdMs: 30 * 60 * 1000,
  });

  const avaGatewayService = getAvaGatewayService(
    featureLoader,
    settingsService,
    healthMonitorService
  );
  // Sensor Registry (external sensor data ingestion)
  const sensorRegistryService = new SensorRegistryService(events);

  // Context Aggregator (reads sensor readings → unified UserPresenceState)
  const contextAggregator = new ContextAggregator(sensorRegistryService);

  // Role Registry (shared agent template registry)
  const roleRegistryService = new RoleRegistryService(events);
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const registeredCount = registerBuiltInTemplates(
      roleRegistryService,
      globalSettings.userProfile,
      globalSettings.personaOverrides
    );
    events.emit('authority:registry-ready', { templateCount: roleRegistryService.size });
    logger.info(`Role registry ready with ${registeredCount} built-in templates`);
  } catch (error) {
    logger.error('Failed to register built-in templates — registry will be empty:', error);
  }

  // Integration Registry (unified external connection management)
  const integrationRegistryService = new IntegrationRegistryService(events);
  try {
    const integrationCount = registerBuiltInIntegrations(integrationRegistryService);
    logger.info(`Integration registry ready with ${integrationCount} built-in integrations`);
  } catch (error) {
    logger.error('Failed to register built-in integrations:', error);
  }

  // Agent Factory and Dynamic Executor (uses registry for template resolution)
  const agentFactoryService = new AgentFactoryService(roleRegistryService, events);
  const dynamicAgentExecutor = new DynamicAgentExecutor(events);

  // Antagonistic Review Service for Ava + Jon PRD reviews
  const antagonisticReviewService = AntagonisticReviewService.getInstance(
    agentFactoryService,
    events,
    settingsService
  );

  // Agent Scoring Service (auto-scores agent traces based on feature lifecycle)
  // Created for side effects only (event subscriptions in constructor)
  new AgentScoringService(events, featureLoader);

  // HeadsdownService for autonomous agent management
  const headsdownService = HeadsdownService.getInstance(
    events,
    settingsService,
    featureLoader,
    roleRegistryService
  );

  // DevServerService with event emitter for real-time log streaming
  const devServerService = getDevServerService();

  // Notification Service with event emitter for real-time updates
  const notificationService = getNotificationService();

  // Actionable Items Service with event emitter
  const actionableItemService = getActionableItemService();

  // Actionable Item Bridge — auto-creates items from HITL forms, notifications, escalations, pipeline gates
  const actionableItemBridge = new ActionableItemBridgeService({
    actionableItemService,
    events,
  });

  // Data Integrity Watchdog Service
  const integrityWatchdogService = getDataIntegrityWatchdogService(dataDir);

  // Event History Service
  const eventHistoryService = getEventHistoryService();

  // Event Stream Buffer (ring buffer for engine observability dashboard)
  const eventStreamBuffer = new EventStreamBuffer(1000);

  // Briefing Cursor Service
  const briefingCursorService = getBriefingCursorService(dataDir);

  // Signal Intake Service — bridges external signals to PM Agent pipeline
  const signalIntakeService = new SignalIntakeService(
    events,
    featureLoader,
    repoRoot,
    settingsService
  );

  // Pipeline Orchestrator — unified phase tracking across ops + gtm branches
  const pipelineOrchestrator = new PipelineOrchestrator(events, featureLoader, settingsService);
  // Hydrate the pipeline feature flag from settings (async, non-blocking).
  // Defaults to disabled (false) until the HITL pipeline overhaul ships.
  void settingsService.getGlobalSettings().then((s) => {
    pipelineOrchestrator.setEnabled(s.featureFlags?.pipeline ?? false);
  });

  // Channel Router — routes HITL interactions to the originating channel
  const channelRouter = new ChannelRouter();

  // Docs Update Detector — creates docs update features after milestones
  const docsUpdateDetector = new DocsUpdateDetector(events, featureLoader, repoRoot);
  docsUpdateDetector.start();

  // Authority Service for trust-based policy enforcement
  const authorityService = new AuthorityService(events);

  // Audit Trail (logs all authority events, tracks trust evolution)
  const auditService = new AuditService(events);

  // Authority Agents (AI executives)
  const pmAgent = new PMAuthorityAgent(
    events,
    authorityService,
    featureLoader,
    auditService,
    settingsService,
    hitlFormService
  );

  // GTM Authority Agent (content creation pipeline)
  const gtmAgent = new GTMAuthorityAgent(
    events,
    authorityService,
    featureLoader,
    auditService,
    settingsService,
    contentFlowService,
    hitlFormService
  );

  const projectService = new ProjectService(featureLoader, events);
  projectService.setCalendarService(calendarService);

  // Project Lifecycle Service
  const projectLifecycleService = new ProjectLifecycleService(
    settingsService,
    projectService,
    featureLoader,
    autoModeService,
    events
  );

  // Ceremony Audit Log and Ceremony Service
  const ceremonyAuditLog = new CeremonyAuditLogService();

  // Completion Detector Service — cascades feature done → epic → milestone → project
  const completionDetectorService = new CompletionDetectorService();

  // Fact Store Service — extracts and persists structured facts from agent output
  const factStoreService = new FactStoreService();

  // Trajectory Store Service — persists verified trajectories and feeds Langfuse datasets
  const trajectoryStoreService = new TrajectoryStoreService();

  // Lead Handoff Service — stores phase transition snapshots for LE continuity
  const leadHandoffService = new LeadHandoffService();

  // Lead Engineer Service — production-phase nerve center
  const leadEngineerService = new LeadEngineerService(
    events,
    featureLoader,
    autoModeService,
    projectService,
    projectLifecycleService,
    settingsService,
    metricsService
  );
  const pipelineCheckpointService = new PipelineCheckpointService();

  // ContextFidelityService for shaping prior context on retries
  const contextFidelityService = new ContextFidelityService();

  // ProjM and EM Authority Agents (need leadEngineerService)
  const projmAgent = new ProjMAuthorityAgent(
    events,
    authorityService,
    featureLoader,
    projectService
  );
  const emAgent = new EMAuthorityAgent(
    events,
    authorityService,
    featureLoader,
    autoModeService,
    auditService,
    settingsService,
    hitlFormService
  );

  // PR Feedback Service (monitors open PRs for review comments)
  const prFeedbackService = new PRFeedbackService(events, featureLoader);

  // Worktree Lifecycle Service (auto-cleanup after merge + recovery)
  const worktreeLifecycleService = new WorktreeLifecycleService(events, featureLoader, async () => {
    const runningAgents = await autoModeService.getRunningAgents();
    return runningAgents.map((agent) => ({
      projectPath: agent.projectPath,
      branchName: agent.branchName,
    }));
  });

  // Drift detection and reconciliation services
  const githubStateChecker = new GitHubStateChecker(featureLoader, events);
  const reconciliationService = new ReconciliationService(events, featureLoader, autoModeService);

  // Discord Bot Service for CTO /idea command
  const discordBotService = new DiscordBotService(
    events,
    authorityService,
    featureLoader,
    settingsService,
    repoRoot,
    { pm: pmAgent, projm: projmAgent, em: emAgent }
  );

  // Notification Router — presence-aware routing for completion/failure/HITL events.
  // Reads userPresenceDetection flag from settings; discord DM recipients from
  // DISCORD_DM_RECIPIENTS env var (comma-separated usernames).
  // Subscribes to feature:completed, feature:error, and hitl:form-requested in its constructor.
  let presenceEnabled = false;
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    presenceEnabled = globalSettings.featureFlags?.userPresenceDetection ?? false;
  } catch {
    // Settings unavailable — safe default
  }
  const discordDmRecipientsEnv = process.env.DISCORD_DM_RECIPIENTS ?? '';
  const discordDmRecipients = discordDmRecipientsEnv
    ? discordDmRecipientsEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const notificationRouter = new NotificationRouter(
    sensorRegistryService,
    notificationService,
    events,
    discordBotService,
    { enabled: presenceEnabled, discordRecipients: discordDmRecipients }
  );

  // Issue Management Pipeline (failure → triage → GitHub issue → Discord)
  const triageService = new TriageService(events);
  const issueCreationService = new IssueCreationService(
    events,
    featureLoader,
    triageService,
    settingsService
  );

  // Agent Discord Router for agent-to-Discord message routing
  const agentDiscordRouter = new AgentDiscordRouter(events, discordBotService, roleRegistryService);

  // Scheduler Service with event emitter and data directory
  const schedulerService = getSchedulerService();

  // Automation Service — manages automation registry and cron/manual execution
  const automationService = new AutomationService(schedulerService, dataDir);

  // Job Executor Service — executes one-time scheduled jobs from the calendar
  const jobExecutorService = new JobExecutorService(
    calendarService,
    autoModeService,
    automationService,
    settingsService,
    events
  );

  // Spec Generation Monitor for detecting and cleaning up stalled spec regeneration jobs
  const specGenerationMonitor = getSpecGenerationMonitor(events, {
    checkIntervalMs: 30000, // Check every 30 seconds
    stallThresholdMs: 5 * 60 * 1000, // 5 minutes of inactivity
    enabled: true,
  });

  // Project PM Service — session store for PM Agent chat
  const projectPmService = new ProjectPMService();

  // Todo Service — per-project workspace, CRDT-synced when hivemind active
  const todoService = new TodoService();

  // CRDT Sync Service — multi-instance coordination via WebSocket sync server
  const crdtSyncService = new CrdtSyncService();

  // Ava Channel Service — private multi-instance Ava communication channel
  const avaChannelService = new AvaChannelService(join(dataDir, 'ava-channel-archive'), {
    instanceId: crdtSyncService.getInstanceId(),
  });
  avaChannelService.setEventEmitter((type, payload) =>
    events.emit(type as import('@protolabsai/types').EventType, payload)
  );

  // Friction Tracker Service — self-improvement loop (requires featureLoader + avaChannelService)
  const frictionTrackerService = new FrictionTrackerService({
    featureLoader,
    avaChannelService,
    projectPath: repoRoot,
    instanceId: crdtSyncService.getInstanceId(),
  });

  // Wire friction tracker into the feature-status-change event pipeline.
  // On every blocked status change, classify the reason and record the pattern.
  const failureClassifierService = new FailureClassifierService();
  events.subscribe((type, payload) => {
    if (type !== 'feature:status-changed') return;
    const p = payload as { newStatus?: string; reason?: string; statusChangeReason?: string };
    if (p.newStatus !== 'blocked') return;

    const reason = p.reason ?? p.statusChangeReason ?? '';
    const classification = failureClassifierService.classify(reason);

    void frictionTrackerService.recordFailure(classification.category);
  });

  // Reactive Spawner Service — trigger-based agent spawning with rate limiting and circuit breaking
  const reactiveSpawnerService = getReactiveSpawnerService(
    agentFactoryService,
    dynamicAgentExecutor,
    repoRoot
  );

  // Register Ava cron tasks (daily board health, PR triage, staging ping)
  void registerAvaCronTasks({ schedulerService, reactiveSpawnerService, projectPath: repoRoot });

  // Subscribe to calendar:reminder events and forward to ReactiveSpawner
  calendarService.onReminder((payload) => {
    void reactiveSpawnerService
      .spawnForCron(payload.title, payload.description)
      .catch((err) => logger.warn('[CalendarReminder] spawnForCron failed:', err));
  });

  // Wire integrations health checks (requires integrationService + integrationRegistryService)
  integrationService.initialize(events, settingsService, featureLoader);
  wireHealthChecks(integrationRegistryService);

  // Wire contextFidelityService into leadEngineerService
  leadEngineerService.setCheckpointService(pipelineCheckpointService);
  autoModeService.setPipelineCheckpointService(pipelineCheckpointService);
  leadEngineerService.setContextFidelityService(contextFidelityService);
  leadEngineerService.setKnowledgeStoreService(knowledgeStoreService);
  leadEngineerService.setHITLFormService(hitlFormService);
  await leadEngineerService.initialize();

  // Wire pipelineOrchestrator processors
  pipelineOrchestrator.setProcessors({ ops: pmAgent, gtm: gtmAgent, projm: projmAgent });

  // Initialize Ceremony Service
  ceremonyService.initialize(
    events,
    settingsService,
    featureLoader,
    projectService,
    metricsService,
    dataDir
  );
  ceremonyService.setAuditLog(ceremonyAuditLog);

  // Initialize Completion Detector Service
  completionDetectorService.initialize(events, featureLoader, projectService, dataDir);

  // Initialize Changelog Service for generating changelogs on milestone/project completion
  changelogService.initialize(events, settingsService, featureLoader, projectService);

  // Issue Management Pipeline initialization
  issueCreationService.initialize();

  // Wire project-pm module event subscriptions (status sync)
  await projectPmModule.register({ events, projectPmService, projectService });

  return {
    dataDir,
    repoRoot,
    events,
    settingsService,
    userIdentityService,
    featureLoader,
    trustTierService,
    agentService,
    roleRegistryService,
    agentFactoryService,
    dynamicAgentExecutor,
    headsdownService,
    metricsService,
    ledgerService,
    archivalService,
    googleCalendarSyncService,
    calendarService,
    schedulerService,
    automationService,
    jobExecutorService,
    autoModeService,
    workIntakeService,
    hitlFormService,
    claudeUsageService,
    mcpTestService,
    sensorRegistryService,
    contextAggregator,
    featureHealthService,
    healthMonitorService,
    discordService,
    discordBotService,
    knowledgeStoreService,
    escalationRouter,
    avaGatewayService,
    integrationRegistryService,
    antagonisticReviewService,
    devServerService,
    notificationService,
    notificationRouter,
    actionableItemService,
    actionableItemBridge,
    integrityWatchdogService,
    eventHistoryService,
    eventStreamBuffer,
    briefingCursorService,
    signalIntakeService,
    pipelineOrchestrator,
    pipelineService,
    channelRouter,
    docsUpdateDetector,
    authorityService,
    auditService,
    pmAgent,
    gtmAgent,
    emAgent,
    projmAgent,
    projectService,
    projectLifecycleService,
    completionDetectorService,
    ceremonyAuditLog,
    ceremonyService,
    leadEngineerService,
    pipelineCheckpointService,
    factStoreService,
    trajectoryStoreService,
    leadHandoffService,
    prFeedbackService,
    worktreeLifecycleService,
    githubStateChecker,
    reconciliationService,
    triageService,
    issueCreationService,
    agentDiscordRouter,
    specGenerationMonitor,
    gitWorkflowService,
    contentFlowService,
    projectPmService,
    crdtSyncService,
    todoService,
    avaChannelService,
    doraMetricsService,
    frictionTrackerService,
    reactiveSpawnerService,
    driftCheckInterval: null,
  };
}
