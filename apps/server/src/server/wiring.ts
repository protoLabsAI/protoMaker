// Cross-service wiring: event subscriptions, .setXxx() calls, integration bridges, scheduler setup

import { createLogger } from '@protolabs-ai/utils';

import type { ServiceContainer } from './services.js';

import { UINotificationChannel } from '../services/escalation-channels/ui-notification-channel.js';
import { DiscordChannelEscalation } from '../services/escalation-channels/discord-channel-escalation.js';
import { DiscordDMChannel } from '../services/escalation-channels/discord-dm-channel.js';
import { codeRabbitResolverService } from '../services/coderabbit-resolver-service.js';
import { eventHookService } from '../services/event-hook-service.js';
import { registerMaintenanceTasks } from '../services/maintenance-tasks.js';

const logger = createLogger('Server:Wiring');

/** Constant: 5-minute drift detection interval */
const DRIFT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Wire all cross-service dependencies: event subscriptions, .setXxx() calls,
 * Discord bot initialization, scheduler registration, and integration bridges.
 */
export async function wireServices(services: ServiceContainer): Promise<void> {
  const {
    events,
    settingsService,
    featureLoader,
    repoRoot,
    autoModeService,
    featureHealthService,
    integrityWatchdogService,
    headsdownService,
    agentFactoryService,
    dynamicAgentExecutor,
    devServerService,
    notificationService,
    actionableItemService,
    calendarService,
    googleCalendarSyncService: _googleCalendarSyncService,
    escalationRouter,
    discordService,
    discordBotService,
    roleRegistryService,
    authorityService,
    auditService,
    leadEngineerService,
    pipelineOrchestrator,
    prFeedbackService,
    worktreeLifecycleService,
    githubStateChecker,
    reconciliationService,
    agentDiscordRouter,
    issueCreationService,
    linearAgentService,
    linearAgentRouter,
    projectPlanningService,
    schedulerService,
    dataDir,
    healthMonitorService,
    avaGatewayService,
    specGenerationMonitor,
    eventHistoryService,
    knowledgeStoreService,
    ceremonyAuditLog,
    approvalBridge,
    intakeBridge,
    graphiteSyncScheduler,
    eventStreamBuffer,
    factStoreService,
    leadHandoffService,
  } = services;

  // Calendar service wiring
  calendarService.setFeatureLoader(featureLoader);
  calendarService.setSettingsService(settingsService);

  // Escalation router channels
  escalationRouter.setEventEmitter(events);
  escalationRouter.registerChannel(new UINotificationChannel(events));
  escalationRouter.registerChannel(new DiscordChannelEscalation(discordService));

  // HeadsdownService agent execution wiring
  headsdownService.setAgentExecution(agentFactoryService, dynamicAgentExecutor);

  // DevServerService event emitter wiring
  devServerService.setEventEmitter(events);

  // Notification Service event emitter wiring
  notificationService.setEventEmitter(events);

  // Actionable Items Service event emitter wiring
  actionableItemService.setEventEmitter(events);

  // Data Integrity Watchdog wiring
  integrityWatchdogService.setEventEmitter(events);
  featureLoader.setIntegrityWatchdog(integrityWatchdogService);

  // Event stream buffer subscription
  events.subscribe((type, payload) => {
    eventStreamBuffer.push(type, payload);
  });

  // Auto-mode cross-service wiring
  autoModeService.setAuthorityService(authorityService);
  autoModeService.setFeatureHealthService(featureHealthService);
  autoModeService.setIntegrityWatchdogService(integrityWatchdogService);
  autoModeService.setLeadEngineerService(leadEngineerService);

  // Audit service initialization
  auditService.initialize(authorityService);

  // Listen for retro improvements and create Linear issues when configured
  events.subscribe(async (type, payload) => {
    if (type !== 'retro:improvement:linear-sync') return;
    try {
      const p = payload as {
        projectPath: string;
        projectTitle: string;
        title: string;
        description: string;
        priority: number;
      };

      const { getWorkflowSettings } = await import('../lib/settings-helpers.js');
      const workflowSettings = await getWorkflowSettings(p.projectPath, settingsService, '[Retro]');
      if (!workflowSettings.retro.enabled) return;

      const { LinearMCPClient } = await import('../services/linear-mcp-client.js');
      const linearClient = new LinearMCPClient(settingsService, p.projectPath);
      let teamId: string;
      try {
        teamId = await linearClient.getTeamId();
      } catch {
        logger.warn('[Retro] No Linear teamId configured, skipping issue creation');
        return;
      }
      const result = await linearClient.createIssue({
        title: p.title,
        description: p.description,
        teamId,
        projectId: workflowSettings.retro.improvementLinearProjectId,
        priority: p.priority ?? 3,
      });

      logger.info(`[Retro] Created Linear issue ${result.identifier}: ${p.title}`);
    } catch (error) {
      logger.warn('[Retro] Failed to create Linear issue for improvement:', error);
    }
  });

  // Listen for bug:linear-sync events and create Linear issues in the Bugs project
  events.subscribe(async (type, payload) => {
    if (type !== 'bug:linear-sync') return;
    try {
      const p = payload as {
        projectPath: string;
        title: string;
        description: string;
        priority: number;
        failureCategory: string;
        featureId: string;
      };

      const { getWorkflowSettings } = await import('../lib/settings-helpers.js');
      const workflowSettings = await getWorkflowSettings(p.projectPath, settingsService, '[Bugs]');
      if (!workflowSettings.bugs.enabled || !workflowSettings.bugs.linearProjectId) return;

      const { LinearMCPClient } = await import('../services/linear-mcp-client.js');
      const linearClient = new LinearMCPClient(settingsService, p.projectPath);
      let teamId: string;
      try {
        teamId = await linearClient.getTeamId();
      } catch {
        logger.warn('[Bugs] No Linear teamId configured, skipping bug issue creation');
        return;
      }
      const result = await linearClient.createIssue({
        title: p.title,
        description: p.description,
        teamId,
        projectId: workflowSettings.bugs.linearProjectId,
        priority: p.priority ?? 3,
      });

      logger.info(`[Bugs] Created Linear issue ${result.identifier}: ${p.title}`);
    } catch (error) {
      logger.warn('[Bugs] Failed to create Linear issue for bug:', error);
    }
  });

  // Lead Engineer cross-service wiring
  leadEngineerService.setCodeRabbitResolver(codeRabbitResolverService);
  leadEngineerService.setPRFeedbackService(prFeedbackService);
  leadEngineerService.setDiscordBot(discordBotService);
  leadEngineerService.setAgentFactory(agentFactoryService);
  leadEngineerService.setFactStoreService(factStoreService);
  leadEngineerService.setHandoffService(leadHandoffService);

  // PR Feedback service wiring
  prFeedbackService.setAutoModeService(autoModeService);
  prFeedbackService.initialize();
  prFeedbackService.setLeadEngineerService(leadEngineerService);

  // Worktree Lifecycle Service initialization
  worktreeLifecycleService.initialize();

  // Drift detection setup
  githubStateChecker.registerProject(repoRoot);

  // Periodic drift detection: check every 5 minutes, reconcile any drifts found
  services.driftCheckInterval = setInterval(async () => {
    try {
      const drifts = await githubStateChecker.checkAllProjects();
      for (const drift of drifts) {
        await reconciliationService.reconcile(drift);
      }
    } catch (err) {
      logger.warn('Drift detection cycle failed:', err);
    }
  }, DRIFT_CHECK_INTERVAL_MS);

  // Prune phantom worktrees on startup
  worktreeLifecycleService.prunePhantomWorktrees(repoRoot).catch((err: unknown) => {
    logger.warn('Failed to prune phantom worktrees on startup:', err);
  });

  // Discord Bot Service initialization
  discordBotService.setRoleRegistry(roleRegistryService);
  void discordBotService.initialize();

  // Wire Discord bot service to Ava Gateway
  avaGatewayService.setDiscordBot(discordBotService);

  // Event Hook Service initialization (must be after DiscordBotService)
  eventHookService.initialize(
    events,
    settingsService,
    eventHistoryService,
    featureLoader,
    discordBotService
  );

  // Bridge integration:discord events to Discord bot service
  events.subscribe(async (type, payload) => {
    if (type !== 'integration:discord') return;
    const p = payload as {
      channelId?: string;
      content?: string;
      action?: string;
      correlationId?: string;
    };
    if (p.action !== 'send_message' || !p.channelId || !p.content) return;
    try {
      await discordBotService.sendToChannel(p.channelId, p.content);
      if (p.correlationId) {
        ceremonyAuditLog.updateDeliveryStatus(p.correlationId, 'delivered');
      }
    } catch (error) {
      logger.error('Failed to deliver integration:discord event:', error);
      if (p.correlationId) {
        ceremonyAuditLog.updateDeliveryStatus(
          p.correlationId,
          'failed',
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  });

  // Agent Discord Router wiring
  agentDiscordRouter.start();

  // Wire Discord bot service to headsdown service
  headsdownService.setDiscordBotService(discordBotService);

  // Register Discord DM escalation channel (requires discordBotService)
  escalationRouter.registerChannel(new DiscordDMChannel(discordBotService, events));

  // Listen for Linear comment follow-up events and route to agent
  events.subscribe((type, payload) => {
    if (type === 'linear:comment:followup') {
      const { featureId, projectPath, commentBody, userName } = payload as {
        featureId: string;
        projectPath: string;
        commentBody: string;
        userName: string;
      };
      logger.info(`Routing Linear comment to agent for feature ${featureId}`, {
        userName,
      });

      autoModeService
        .followUpFeature(projectPath, featureId, commentBody, undefined, true)
        .catch((error) => {
          logger.error(`Failed to send Linear comment to agent for feature ${featureId}:`, error);
        });
    }
  });

  // Issue Management Pipeline initialization
  issueCreationService.initialize();

  // Linear Agent Service configuration
  linearAgentService.configure(settingsService, repoRoot);
  linearAgentRouter.start();

  // Project Planning Service start
  if (projectPlanningService) {
    projectPlanningService.start();
  }

  // Scheduler Service initialization and maintenance task registration
  schedulerService.initialize(events, dataDir);
  void schedulerService
    .start()
    .then(() => {
      return registerMaintenanceTasks(
        schedulerService,
        events,
        autoModeService,
        featureHealthService,
        integrityWatchdogService,
        featureLoader,
        settingsService,
        graphiteSyncScheduler
      );
    })
    .catch((err) => {
      logger.error('Scheduler startup or maintenance task registration failed:', err);
    });

  // Health Monitor Service event emitter wiring
  healthMonitorService.setEventEmitter(events);

  // Ava Gateway Service initialization
  void avaGatewayService
    .initialize(events, repoRoot, process.env.DISCORD_CHANNEL_INFRA || '')
    .then(() => {
      avaGatewayService.start();
      logger.info('Ava Gateway Service started and listening to events');
    })
    .catch((err) => {
      logger.error('Ava Gateway Service initialization failed:', err);
    });

  // Linear approval bridge start
  approvalBridge.start();

  // Linear intake bridge start
  intakeBridge.start();

  // Spec Generation Monitor start
  specGenerationMonitor.startMonitoring();
}
