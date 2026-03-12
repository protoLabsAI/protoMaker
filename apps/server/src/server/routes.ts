// Route registration: all app.use() mounts, rate limiting, and OTEL initialization

import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from './services.js';

import { authMiddleware } from '../lib/auth.js';
import { requireJsonContentType } from '../middleware/require-json-content-type.js';
// Note: OTel is initialized in startup.ts via initOtel() — a single unified NodeSDK
// with both OTLP exporter and LangfuseSpanProcessor. No separate init needed here.
import { cleanupStaleValidations } from '../routes/github/routes/validation-common.js';

import { createAuthRoutes } from '../routes/auth/index.js';
import { createFsRoutes } from '../routes/fs/index.js';
import {
  createHealthRoutes,
  createDetailedHandler,
  createQuickHandler,
  createStandardHandler,
  createDeepHandler,
} from '../routes/health/index.js';
import { createSessionsRoutes } from '../routes/sessions/index.js';
import { createFeaturesRoutes } from '../routes/features/index.js';
import { createProjectsRoutes } from '../routes/projects/index.js';
import { createAutoModeRoutes } from '../routes/auto-mode/index.js';
import { createEnhancePromptRoutes } from '../routes/enhance-prompt/index.js';
import { createWorktreeRoutes } from '../routes/worktree/index.js';
import { createGitRoutes } from '../routes/git/index.js';
import { createSetupRoutes } from '../routes/setup/index.js';
import { createSuggestionsRoutes } from '../routes/suggestions/index.js';
import { createModelsRoutes } from '../routes/models/index.js';
import { createRunningAgentsRoutes } from '../routes/running-agents/index.js';
import { createWorkspaceRoutes } from '../routes/workspace/index.js';
import { createTemplatesRoutes } from '../routes/templates/index.js';
import { createTerminalRoutes } from '../routes/terminal/index.js';
import { createSettingsRoutes } from '../routes/settings/index.js';
import { createUserRoutes } from '../routes/user-routes.js';
import { createSpecRegenerationRoutes } from '../routes/app-spec/index.js';
import { createClaudeRoutes } from '../routes/claude/index.js';
import { createGitHubRoutes } from '../routes/github/index.js';
import { createContextRoutes } from '../routes/context/index.js';
import { createContentRoutes } from '../routes/content/index.js';
import { createFlowsRoutes } from '../routes/flows/index.js';
import { createBacklogPlanRoutes } from '../routes/backlog-plan/index.js';
import { createCalendarRoutes } from '../routes/calendar/index.js';
import { createGoogleOAuthRoutes } from '../routes/google-calendar/oauth.js';
import { createMCPRoutes } from '../routes/mcp/index.js';
import { createEscalationRoutes } from '../routes/escalation.js';
import { createPipelineRoutes } from '../routes/pipeline/index.js';
import { createMetricsRoutes } from '../routes/metrics/index.js';
import { createNotificationsRoutes } from '../routes/notifications/index.js';
import { createHITLFormRoutes } from '../routes/hitl-forms/index.js';
import { createActionableItemsRoutes } from '../routes/actionable-items/index.js';
import { createEventHistoryRoutes } from '../routes/event-history/index.js';
import { createBriefingRoutes } from '../routes/briefing/index.js';
import { createSkillsRoutes } from '../routes/skills/index.js';
import { createIntegrationRoutes } from '../routes/integrations/index.js';
import { createDashboardRoutes } from '../routes/dashboard.js';
import { createAuthorityRoutes } from '../routes/authority/index.js';
import { createCosRoutes } from '../routes/cos/index.js';
import { createCeremoniesRoutes } from '../routes/ceremonies/index.js';
import { createWebhooksRoutes } from '../routes/webhooks/index.js';
import { createDiscordRoutes } from '../routes/discord/index.js';
import { createAvaRoutes } from '../routes/ava/index.js';
import { createKnowledgeRoutes } from '../routes/knowledge/index.js';
import { createDesignsRoutes } from '../routes/designs/index.js';
import { createPromotionsRoutes } from '../routes/promotions/index.js';
import { createIssuesRoutes } from '../routes/issues/index.js';
import { createDeployRoutes } from '../routes/deploy/index.js';
import { createIntegrityRoutes } from '../routes/integrity.js';
import { createAnalyticsRoutes } from '../routes/analytics.js';
import { createQuarantineRoutes } from '../routes/quarantine.js';
import { createDocsRoutes } from '../routes/docs.js';
import { createAlertsRoutes } from '../routes/alerts/index.js';
import { createEngineRoutes } from '../routes/engine/index.js';
import { createLangfuseRoutes } from '../routes/langfuse/index.js';
import { createChatRoutes } from '../routes/chat/index.js';
import { createCodexRoutes } from '../routes/codex/index.js';
import { createAIRoutes } from '../routes/ai/index.js';
import { createNotesRoutes } from '../routes/notes/index.js';
import { createTodoRoutes } from '../routes/todo/index.js';
import { createSitrepRoutes } from '../routes/sitrep/index.js';
import { createLeadEngineerRoutes } from '../routes/lead-engineer/index.js';
import { createPrometheusRoute } from '../routes/metrics/prometheus.js';
import { createAutomationsRoutes } from '../routes/automations/index.js';
import { createSensorRoutes } from '../routes/sensors/index.js';
import { createProjectPmRoutes } from '../routes/project-pm/index.js';
import { createLedgerRoutes } from '../routes/ledger/index.js';
import { createAvaChannelRoutes } from '../routes/ava-channel/index.js';
import { createHivemindRoutes } from '../routes/hivemind/index.js';
import { createDoraRoutes } from '../routes/dora/index.js';

const logger = createLogger('Server:Routes');

const VALIDATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Register all Express routes and API middleware in the correct order.
 * Unauthenticated routes are mounted before requireApiKey.
 * The global error handler is mounted last.
 */
export function registerRoutes(app: Express, services: ServiceContainer): void {
  const {
    events,
    settingsService,
    featureLoader,
    trustTierService,
    agentService,
    autoModeService,
    worktreeLifecycleService,
    claudeUsageService,
    mcpTestService,
    integrationRegistryService,
    leadEngineerService,
    pmAgent,
    projmAgent,
    emAgent,
    auditService,
    pipelineService,
    metricsService,
    ledgerService,
    notificationService,
    hitlFormService,
    actionableItemService,
    eventHistoryService,
    briefingCursorService,
    projectService,
    projectLifecycleService,
    projectAssignmentService,
    automationService,
    avaGatewayService,
    discordBotService,
    ceremonyService,
    ceremonyAuditLog,
    escalationRouter,
    authorityService,
    calendarService,
    jobExecutorService,
    googleCalendarSyncService,
    knowledgeStoreService,
    integrityWatchdogService,
    featureHealthService,
    userIdentityService,
    pipelineOrchestrator,
    prFeedbackService,
    signalIntakeService,
    gitWorkflowService,
    eventStreamBuffer,
    pipelineCheckpointService,
    gtmAgent,
    completionDetectorService,
    antagonisticReviewService,
    contentFlowService,
    repoRoot,
    sensorRegistryService,
    projectPmService,
    crdtSyncService,
    todoService,
    avaChannelService,
  } = services;

  // Run stale validation cleanup every hour to prevent memory leaks from crashed validations
  setInterval(() => {
    const cleaned = cleanupStaleValidations();
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} stale validation entries`);
    }
  }, VALIDATION_CLEANUP_INTERVAL_MS);

  // Rate limiting — general API (skip health checks and read-only status endpoints)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) =>
      req.path === '/health' ||
      req.path.startsWith('/health/') ||
      req.path.startsWith('/setup/') ||
      req.path === '/settings/status',
    message: { error: 'Too many requests, please try again later' },
  });
  app.use('/api', apiLimiter);

  // Stricter rate limit for auth login (brute force protection)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' },
  });
  app.use('/api/auth/login', authLimiter);

  // Require Content-Type: application/json for all API POST/PUT/PATCH requests
  app.use('/api', requireJsonContentType);

  // OTel is initialized in startup.ts — single unified NodeSDK covers both
  // OTLP HTTP export and AI SDK telemetry via LangfuseSpanProcessor.

  // --- UNAUTHENTICATED ROUTES (must come before authMiddleware) ---
  app.use('/api/health', createHealthRoutes());
  app.use('/api/auth', createAuthRoutes());
  app.use('/api/setup', createSetupRoutes(settingsService));

  // Prometheus metrics endpoint (unauthenticated for Prometheus scraping)
  app.use('/api/metrics', createPrometheusRoute());

  // Webhooks at root level (unauthenticated - uses signature verification)
  app.use('/webhooks', createWebhooksRoutes(events, settingsService));
  // Alerts webhook routes (unauthenticated - Grafana webhooks)
  app.use('/webhooks/alerts', createAlertsRoutes(settingsService, discordBotService));
  // Google Calendar OAuth + sync (unauthenticated — browser-initiated redirect flow)
  app.use(
    '/api/google-calendar',
    createGoogleOAuthRoutes(settingsService, googleCalendarSyncService)
  );

  // --- AUTHENTICATION MIDDLEWARE ---
  // Apply authentication to all /api/* routes
  app.use('/api', authMiddleware);

  // --- PROTECTED HEALTH ENDPOINTS (detailed info requires auth) ---
  app.get('/api/health/detailed', createDetailedHandler(crdtSyncService));
  app.get('/api/health/quick', createQuickHandler());
  app.get(
    '/api/health/standard',
    createStandardHandler(agentService, featureLoader, autoModeService, repoRoot)
  );
  app.get(
    '/api/health/deep',
    createDeepHandler(agentService, featureLoader, autoModeService, repoRoot)
  );

  // --- AUTHENTICATED API ROUTES ---
  app.use('/api/fs', createFsRoutes(events));
  app.use('/api/sessions', createSessionsRoutes(agentService));
  app.use(
    '/api/features',
    createFeaturesRoutes(
      featureLoader,
      trustTierService,
      settingsService,
      events,
      authorityService,
      featureHealthService
    )
  );
  app.use(
    '/api/auto-mode',
    createAutoModeRoutes(
      autoModeService,
      featureLoader,
      leadEngineerService,
      settingsService,
      events
    )
  );
  app.use('/api/enhance-prompt', createEnhancePromptRoutes(settingsService));
  app.use(
    '/api/worktree',
    createWorktreeRoutes(
      events,
      settingsService,
      worktreeLifecycleService,
      autoModeService,
      featureLoader
    )
  );
  app.use('/api/git', createGitRoutes());
  app.use('/api/suggestions', createSuggestionsRoutes(events, settingsService));
  app.use('/api/models', createModelsRoutes());
  app.use('/api/spec-regeneration', createSpecRegenerationRoutes(events, settingsService));
  app.use('/api/app-spec', createSpecRegenerationRoutes(events, settingsService));
  app.use('/api/running-agents', createRunningAgentsRoutes(autoModeService));
  app.use('/api/workspace', createWorkspaceRoutes());
  app.use('/api/templates', createTemplatesRoutes());
  app.use('/api/terminal', createTerminalRoutes());
  app.use('/api/settings', createSettingsRoutes(settingsService, events));
  app.use('/api/user', createUserRoutes(userIdentityService));
  app.use('/api/claude', createClaudeRoutes(claudeUsageService));
  app.use('/api/github', createGitHubRoutes(events, settingsService));
  app.use('/api/context', createContextRoutes(settingsService));
  app.use('/api/content', createContentRoutes(settingsService));
  app.use('/api/backlog-plan', createBacklogPlanRoutes(events, settingsService));
  app.use('/api/calendar', createCalendarRoutes(calendarService, jobExecutorService, events));
  app.use('/api/mcp', createMCPRoutes(mcpTestService));
  app.use(
    '/api/integrations',
    authMiddleware,
    createIntegrationRoutes(settingsService, integrationRegistryService, signalIntakeService)
  );
  app.use(
    '/api/system',
    authMiddleware,
    createDashboardRoutes(autoModeService, leadEngineerService)
  );
  app.use(
    '/api/authority',
    authMiddleware,
    createAuthorityRoutes(
      authorityService,
      events,
      featureLoader,
      { pm: pmAgent, projm: projmAgent, em: emAgent },
      auditService
    )
  );
  app.use(
    '/api/cos',
    authMiddleware,
    createCosRoutes(
      events,
      featureLoader,
      { pm: pmAgent, projm: projmAgent, em: emAgent },
      settingsService
    )
  );
  app.use('/api/pipeline', createPipelineRoutes(pipelineService));
  app.use(
    '/api/metrics',
    createMetricsRoutes(
      metricsService,
      ledgerService,
      services.doraMetricsService,
      featureLoader,
      services.frictionTrackerService
    )
  );
  app.use('/api/notifications', createNotificationsRoutes(notificationService));
  app.use('/api/hitl-forms', createHITLFormRoutes(hitlFormService));
  app.use(
    '/api/actionable-items',
    createActionableItemsRoutes(actionableItemService, settingsService)
  );
  app.use('/api/skills', createSkillsRoutes());
  app.use('/api/event-history', createEventHistoryRoutes(eventHistoryService, settingsService));
  app.use(
    '/api/briefing',
    authMiddleware,
    createBriefingRoutes(eventHistoryService, briefingCursorService)
  );
  app.use(
    '/api/projects',
    createProjectsRoutes(
      featureLoader,
      events,
      projectService,
      projectLifecycleService,
      undefined,
      projectAssignmentService
    )
  );
  app.use('/api/automations', createAutomationsRoutes(automationService));
  app.use('/api/ava', createAvaRoutes(services));
  app.use('/api/discord', createDiscordRoutes(discordBotService));
  app.use(
    '/api/ceremonies',
    createCeremoniesRoutes(events, featureLoader, projectService, ceremonyService, ceremonyAuditLog)
  );
  app.use('/api/issues', createIssuesRoutes(events));
  app.use('/api/deploy', createDeployRoutes(autoModeService));
  app.use('/api/docs', createDocsRoutes(repoRoot));
  app.use('/api/integrity', createIntegrityRoutes(integrityWatchdogService));
  app.use('/api/escalation', createEscalationRoutes(escalationRouter));
  app.use('/api/analytics', createAnalyticsRoutes());
  app.use('/api/quarantine', createQuarantineRoutes());

  // Lead Engineer routes (production-phase nerve center)
  app.use('/api/lead-engineer', createLeadEngineerRoutes(leadEngineerService));
  app.use(
    '/api/engine',
    createEngineRoutes(
      autoModeService,
      leadEngineerService,
      prFeedbackService,
      signalIntakeService,
      gitWorkflowService,
      eventStreamBuffer,
      projectService,
      contentFlowService,
      featureLoader,
      pipelineCheckpointService,
      events,
      gtmAgent,
      pipelineOrchestrator,
      ceremonyService,
      completionDetectorService,
      settingsService
    )
  );
  app.use('/api/langfuse', createLangfuseRoutes());
  app.use('/api/flows', createFlowsRoutes(antagonisticReviewService));
  app.use('/api/chat', createChatRoutes(services));
  app.use('/api/codex', createCodexRoutes());
  app.use('/api/ai', createAIRoutes());
  app.use('/api/notes', createNotesRoutes(events, services._crdtStore));
  app.use('/api/todos', createTodoRoutes(todoService));
  app.use('/api/sitrep', createSitrepRoutes({ featureLoader, autoModeService, repoRoot }));
  // Knowledge store routes (chunked retrieval)
  if (knowledgeStoreService) {
    app.use('/api/knowledge', createKnowledgeRoutes(knowledgeStoreService));
    logger.info('Knowledge store routes mounted at /api/knowledge');
  }

  // Designs routes (.pen file management)
  app.use('/api/designs', createDesignsRoutes());
  logger.info('Designs routes mounted at /api/designs');

  // Promotion orchestration routes
  app.use('/api/promotions', createPromotionsRoutes());
  logger.info('Promotion routes mounted at /api/promotions');

  // Sensor registry routes (core sensor framework)
  app.use('/api/sensors', createSensorRoutes(sensorRegistryService));
  logger.info('Sensor routes mounted at /api/sensors');

  // Project PM Agent routes
  app.use(
    '/api/project-pm',
    createProjectPmRoutes(projectPmService, projectService, ceremonyService, featureLoader, events)
  );
  logger.info('Project PM routes mounted at /api/project-pm');

  // Ledger REST endpoints (event persistence layer)
  app.use('/api/ledger', createLedgerRoutes(ledgerService, featureLoader));
  logger.info('Ledger routes mounted at /api/ledger');

  // Ava Channel routes (private coordination channel for Ava instances)
  app.use('/api/ava-channel', createAvaChannelRoutes(avaChannelService, featureLoader));
  logger.info('Ava channel routes mounted at /api/ava-channel');

  // Hivemind routes (peer discovery and instance status for the unified dashboard)
  app.use('/api/hivemind', createHivemindRoutes(crdtSyncService));
  logger.info('Hivemind routes mounted at /api/hivemind');

  // DORA metrics routes (lead time, deployment frequency, change failure rate, recovery, rework)
  app.use('/api/dora', createDoraRoutes(services.doraMetricsService));
  logger.info('DORA metrics routes mounted at /api/dora');

  // Note: Sentry v8 automatically captures Express errors - no manual error handler needed
}
