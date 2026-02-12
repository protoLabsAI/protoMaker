/**
 * Automaker Backend Server
 *
 * Provides HTTP/WebSocket API for both web and Electron modes.
 * In Electron mode, this server runs locally.
 * In web mode, this server runs on a remote host.
 */

// Load environment variables FIRST, before any imports that depend on them
// (auth.ts reads AUTOMAKER_API_KEY at module load time)
import dotenv from 'dotenv';
dotenv.config();

import { execSync } from 'node:child_process';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cookie from 'cookie';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

import { createEventEmitter, type EventEmitter } from './lib/events.js';
import { initAllowedPaths } from '@automaker/platform';
import { createLogger, setLogLevel, LogLevel } from '@automaker/utils';

const logger = createLogger('Server');

/**
 * Map server log level string to LogLevel enum
 */
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
};
import { authMiddleware, validateWsConnectionToken, checkRawAuthentication } from './lib/auth.js';
import { requireJsonContentType } from './middleware/require-json-content-type.js';
import { createAuthRoutes } from './routes/auth/index.js';
import { createFsRoutes } from './routes/fs/index.js';
import {
  createHealthRoutes,
  createDetailedHandler,
  createQuickHandler,
  createStandardHandler,
  createDeepHandler,
} from './routes/health/index.js';
import { createAgentRoutes } from './routes/agent/index.js';
import { createSessionsRoutes } from './routes/sessions/index.js';
import { createFeaturesRoutes } from './routes/features/index.js';
import { createProjectsRoutes } from './routes/projects/index.js';
import { createAutoModeRoutes } from './routes/auto-mode/index.js';
import { createEnhancePromptRoutes } from './routes/enhance-prompt/index.js';
import { createWorktreeRoutes } from './routes/worktree/index.js';
import { createGitRoutes } from './routes/git/index.js';
import { createSetupRoutes } from './routes/setup/index.js';
import { createSuggestionsRoutes } from './routes/suggestions/index.js';
import { createModelsRoutes } from './routes/models/index.js';
import { createRunningAgentsRoutes } from './routes/running-agents/index.js';
import { createWorkspaceRoutes } from './routes/workspace/index.js';
import { createTemplatesRoutes } from './routes/templates/index.js';
import {
  createTerminalRoutes,
  validateTerminalToken,
  isTerminalEnabled,
  isTerminalPasswordRequired,
} from './routes/terminal/index.js';
import { createSettingsRoutes } from './routes/settings/index.js';
import { AgentService } from './services/agent-service.js';
import { FeatureLoader } from './services/feature-loader.js';
import { AutoModeService } from './services/auto-mode-service.js';
import { getTerminalService } from './services/terminal-service.js';
import { SettingsService } from './services/settings-service.js';
import { createSpecRegenerationRoutes } from './routes/app-spec/index.js';
import { createClaudeRoutes } from './routes/claude/index.js';
import { ClaudeUsageService } from './services/claude-usage-service.js';
import { createCodexRoutes } from './routes/codex/index.js';
import { CodexUsageService } from './services/codex-usage-service.js';
import { CodexAppServerService } from './services/codex-app-server-service.js';
import { CodexModelCacheService } from './services/codex-model-cache-service.js';
import { createGitHubRoutes } from './routes/github/index.js';
import { createContextRoutes } from './routes/context/index.js';
import { createBacklogPlanRoutes } from './routes/backlog-plan/index.js';
import { cleanupStaleValidations } from './routes/github/routes/validation-common.js';
import { createMCPRoutes } from './routes/mcp/index.js';
import { MCPTestService } from './services/mcp-test-service.js';
import { createPipelineRoutes } from './routes/pipeline/index.js';
import { pipelineService } from './services/pipeline-service.js';
import { createMetricsRoutes } from './routes/metrics/index.js';
import { MetricsService } from './services/metrics-service.js';
import { createIdeationRoutes } from './routes/ideation/index.js';
import { IdeationService } from './services/ideation-service.js';
import { getDevServerService } from './services/dev-server-service.js';
import { eventHookService } from './services/event-hook-service.js';
import { createNotificationsRoutes } from './routes/notifications/index.js';
import { getNotificationService } from './services/notification-service.js';
import { createEventHistoryRoutes } from './routes/event-history/index.js';
import { getEventHistoryService } from './services/event-history-service.js';
import { createBriefingRoutes } from './routes/briefing/index.js';
import { getBriefingCursorService } from './services/briefing-cursor-service.js';
import { createRalphRoutes } from './routes/ralph/index.js';
import { RalphLoopService } from './services/ralph-loop-service.js';
import { HeadsdownService } from './services/headsdown-service.js';
import { PRDService } from './services/prd-service.js';
import { createSkillsRoutes } from './routes/skills/index.js';
import { getSchedulerService } from './services/scheduler-service.js';
import { getHealthMonitorService } from './services/health-monitor-service.js';
import { GraphiteSyncScheduler } from './services/graphite-sync-scheduler.js';
import { graphiteService } from './services/graphite-service.js';
import { createWebhooksRoutes } from './routes/webhooks/index.js';
import { createSchedulerRoutes } from './routes/scheduler/index.js';
import { integrationService } from './services/integration-service.js';
import { createIntegrationRoutes } from './routes/integrations/index.js';
import { AuthorityService } from './services/authority-service.js';
import { createAuthorityRoutes } from './routes/authority/index.js';
import { createCosRoutes } from './routes/cos/index.js';
import { PMAuthorityAgent } from './services/authority-agents/pm-agent.js';
import { ProjMAuthorityAgent } from './services/authority-agents/projm-agent.js';
import { EMAuthorityAgent } from './services/authority-agents/em-agent.js';
import { StatusMonitorAgent } from './services/authority-agents/status-agent.js';
import { DiscordApprovalRouter } from './services/authority-agents/discord-approval-router.js';
import { AuditService } from './services/audit-service.js';
import { PRFeedbackService } from './services/pr-feedback-service.js';
import { WorktreeLifecycleService } from './services/worktree-lifecycle-service.js';
import { DiscordBotService } from './services/discord-bot-service.js';
import { RoleRegistryService } from './services/role-registry-service.js';
import { AgentFactoryService } from './services/agent-factory-service.js';
import { DynamicAgentExecutor } from './services/dynamic-agent-executor.js';
import { createAgentManagementRoutes } from './routes/agents/index.js';
// import { ReconciliationService } from './services/reconciliation-service.js'; // TODO: Re-enable when implemented
// import { GitHubStateChecker } from './services/github-state-checker.js'; // TODO: Re-enable when implemented
import { ProjectService } from './services/project-service.js';
import { getSpecGenerationMonitor } from './services/spec-generation-monitor.js';
import { registerMaintenanceTasks } from './services/maintenance-tasks.js';
import { FeatureHealthService } from './services/feature-health-service.js';
import { BeadsService } from './services/beads-service.js';
import { createBeadsRoutes } from './routes/beads/index.js';
import { getAvaGatewayService } from './services/ava-gateway-service.js';
import { getDiscordService } from './services/discord-service.js';
import { createDiscordRoutes } from './routes/discord/index.js';
import { createAvaRoutes } from './routes/ava/index.js';
import { MAX_SYSTEM_CONCURRENCY } from '@automaker/types';

const PORT = parseInt(process.env.PORT || '3008', 10);
const HOST = process.env.HOST || '0.0.0.0';
const HOSTNAME = process.env.HOSTNAME || 'localhost';
const DATA_DIR = process.env.DATA_DIR || './data';
logger.info('[SERVER_STARTUP] process.env.DATA_DIR:', process.env.DATA_DIR);
logger.info('[SERVER_STARTUP] Resolved DATA_DIR:', DATA_DIR);
logger.info('[SERVER_STARTUP] process.cwd():', process.cwd());
logger.info(
  `[SERVER_STARTUP] MAX_SYSTEM_CONCURRENCY: ${MAX_SYSTEM_CONCURRENCY}${process.env.AUTOMAKER_MAX_CONCURRENCY ? ` (from AUTOMAKER_MAX_CONCURRENCY=${process.env.AUTOMAKER_MAX_CONCURRENCY})` : ' (default)'}`
);

// Determine the repository/project root directory
// When running via npm workspace (npm run dev:web), process.cwd() is apps/server/
// but services like Discord bot need the monorepo root where .automaker/ lives
const REPO_ROOT = (() => {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return process.cwd();
  }
})();
logger.info('[SERVER_STARTUP] REPO_ROOT:', REPO_ROOT);

const ENABLE_REQUEST_LOGGING_DEFAULT = process.env.ENABLE_REQUEST_LOGGING !== 'false'; // Default to true

// Runtime-configurable request logging flag (can be changed via settings)
let requestLoggingEnabled = ENABLE_REQUEST_LOGGING_DEFAULT;

/**
 * Enable or disable HTTP request logging at runtime
 */
export function setRequestLoggingEnabled(enabled: boolean): void {
  requestLoggingEnabled = enabled;
}

/**
 * Get current request logging state
 */
export function isRequestLoggingEnabled(): boolean {
  return requestLoggingEnabled;
}

// Width for log box content (excluding borders)
const BOX_CONTENT_WIDTH = 67;

// Check for required environment variables
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

if (!hasAnthropicKey) {
  const wHeader = '⚠️  WARNING: No Claude authentication configured'.padEnd(BOX_CONTENT_WIDTH);
  const w1 = 'The Claude Agent SDK requires authentication to function.'.padEnd(BOX_CONTENT_WIDTH);
  const w2 = 'Set your Anthropic API key:'.padEnd(BOX_CONTENT_WIDTH);
  const w3 = '  export ANTHROPIC_API_KEY="sk-ant-..."'.padEnd(BOX_CONTENT_WIDTH);
  const w4 = 'Or use the setup wizard in Settings to configure authentication.'.padEnd(
    BOX_CONTENT_WIDTH
  );

  logger.warn(`
╔═════════════════════════════════════════════════════════════════════╗
║  ${wHeader}║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║  ${w1}║
║                                                                     ║
║  ${w2}║
║  ${w3}║
║                                                                     ║
║  ${w4}║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
`);
} else {
  logger.info('✓ ANTHROPIC_API_KEY detected');
}

// Initialize security
initAllowedPaths();

// Create Express app
const app = express();

// Middleware
// Custom colored logger showing only endpoint and status code (dynamically configurable)
morgan.token('status-colored', (_req, res) => {
  const status = res.statusCode;
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`; // Red for server errors
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`; // Yellow for client errors
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`; // Cyan for redirects
  return `\x1b[32m${status}\x1b[0m`; // Green for success
});

app.use(
  morgan(':method :url :status-colored', {
    // Skip when request logging is disabled or for health check endpoints
    skip: (req) => !requestLoggingEnabled || req.url === '/api/health',
  })
);
// CORS configuration
// When using credentials (cookies), origin cannot be '*'
// We dynamically allow the requesting origin for local development
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Electron)
      if (!origin) {
        callback(null, true);
        return;
      }

      // If CORS_ORIGIN is set, use it (can be comma-separated list)
      const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
      if (allowedOrigins && allowedOrigins.length > 0 && allowedOrigins[0] !== '*') {
        if (allowedOrigins.includes(origin)) {
          callback(null, origin);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
        return;
      }

      // For local development, allow all localhost/loopback origins (any port)
      try {
        const url = new URL(origin);
        const hostname = url.hostname;

        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '::1' ||
          hostname === '0.0.0.0' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')
        ) {
          callback(null, origin);
          return;
        }
      } catch (err) {
        // Ignore URL parsing errors
      }

      // Reject other origins by default for security
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Preserve raw body for webhook signature verification
// This middleware must be before express.json()
app.use(
  express.json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      // Store raw body for routes that need it (e.g., webhook signature verification)
      req.rawBody = buf;
    },
  })
);
app.use(cookieParser());

// Create shared event emitter for streaming
const events: EventEmitter = createEventEmitter();

// Create services
// Note: settingsService is created first so it can be injected into other services
const settingsService = new SettingsService(DATA_DIR);
const agentService = new AgentService(DATA_DIR, events, settingsService);
const featureLoader = new FeatureLoader();
const metricsService = new MetricsService(featureLoader);
const autoModeService = new AutoModeService(events, settingsService);
const claudeUsageService = new ClaudeUsageService();
const codexAppServerService = new CodexAppServerService();
const codexModelCacheService = new CodexModelCacheService(DATA_DIR, codexAppServerService);
const codexUsageService = new CodexUsageService(codexAppServerService);
const mcpTestService = new MCPTestService(settingsService);
const featureHealthService = new FeatureHealthService(featureLoader, autoModeService);
const beadsService = new BeadsService('bd', events);
const discordService = getDiscordService();

// Initialize Health Monitor Service early with autoRemediate enabled
const healthMonitorService = getHealthMonitorService(featureLoader, {
  autoRemediate: true,
  checkIntervalMs: 5 * 60 * 1000,
  stuckThresholdMs: 30 * 60 * 1000,
});

const avaGatewayService = getAvaGatewayService(
  featureLoader,
  beadsService,
  discordService,
  settingsService,
  healthMonitorService
);
const ideationService = new IdeationService(events, settingsService, featureLoader);
const ralphLoopService = new RalphLoopService(events, autoModeService, settingsService);
// Initialize Role Registry (shared agent template registry)
const roleRegistryService = new RoleRegistryService(events);

// Initialize Agent Factory and Dynamic Executor (uses registry for template resolution)
const agentFactoryService = new AgentFactoryService(roleRegistryService, events);
const dynamicAgentExecutor = new DynamicAgentExecutor(events);

// Initialize HeadsdownService for autonomous agent management
const headsdownService = HeadsdownService.getInstance(
  events,
  settingsService,
  featureLoader,
  roleRegistryService
);

// Initialize PRDService for SPARC PRD management
const prdService = PRDService.getInstance(events);

// Initialize DevServerService with event emitter for real-time log streaming
const devServerService = getDevServerService();
devServerService.setEventEmitter(events);

// Initialize Notification Service with event emitter for real-time updates
const notificationService = getNotificationService();
notificationService.setEventEmitter(events);

// Initialize Data Integrity Watchdog Service
const { getDataIntegrityWatchdogService } =
  await import('./services/data-integrity-watchdog-service.js');
const integrityWatchdogService = getDataIntegrityWatchdogService(DATA_DIR);
integrityWatchdogService.setEventEmitter(events);

// Initialize Event History Service
const eventHistoryService = getEventHistoryService();

// Initialize Briefing Cursor Service
const briefingCursorService = getBriefingCursorService(DATA_DIR);

// Initialize Event Hook Service for custom event triggers (with history storage)
eventHookService.initialize(events, settingsService, eventHistoryService, featureLoader);

// Initialize Integration Service for Linear, Discord, and other external integrations
integrationService.initialize(events, settingsService, featureLoader);

// Initialize Authority Service for trust-based policy enforcement
const authorityService = new AuthorityService(events);

// Wire authority service into auto-mode for policy-gated feature execution
autoModeService.setAuthorityService(authorityService);

// Wire integrity watchdog service into auto-mode for data integrity checks
autoModeService.setIntegrityWatchdogService(integrityWatchdogService);

// Initialize Audit Trail (logs all authority events, tracks trust evolution)
const auditService = new AuditService(events);
auditService.initialize(authorityService);

// Initialize Authority Agents (AI executives) - pass auditService for decision tracking
const pmAgent = new PMAuthorityAgent(events, authorityService, featureLoader, auditService);
const projectService = new ProjectService(featureLoader);

// Initialize Ceremony Service for milestone completion ceremonies
const { ceremonyService } = await import('./services/ceremony-service.js');
ceremonyService.initialize(events, settingsService, featureLoader, projectService);

const projmAgent = new ProjMAuthorityAgent(events, authorityService, featureLoader, projectService);
const emAgent = new EMAuthorityAgent(
  events,
  authorityService,
  featureLoader,
  autoModeService,
  auditService,
  settingsService
);
const statusMonitor = new StatusMonitorAgent(events, authorityService, featureLoader);

// Initialize Discord approval routing (listens for authority:awaiting-approval events)
const discordApprovalRouter = new DiscordApprovalRouter(events);
discordApprovalRouter.initialize();

// Initialize PR Feedback Service (monitors open PRs for review comments)
const prFeedbackService = new PRFeedbackService(events, featureLoader);
// Wire up AutoModeService for automatic agent restart on PR feedback
prFeedbackService.setAutoModeService(autoModeService);
prFeedbackService.initialize();

// Initialize Worktree Lifecycle Service (auto-cleanup after merge + recovery)
// Pass running features checker to prevent deleting worktrees with active agents
const worktreeLifecycleService = new WorktreeLifecycleService(events, featureLoader, async () => {
  const runningAgents = await autoModeService.getRunningAgents();
  return runningAgents.map((agent) => ({
    projectPath: agent.projectPath,
    branchName: agent.branchName,
  }));
});
worktreeLifecycleService.initialize();

// Initialize Discord Bot Service for CTO /idea command
// Only connects if DISCORD_BOT_TOKEN is set in environment
const discordBotService = new DiscordBotService(
  events,
  authorityService,
  featureLoader,
  settingsService,
  REPO_ROOT,
  { pm: pmAgent, projm: projmAgent, em: emAgent, statusMonitor }
);
void discordBotService.initialize();

// Initialize Agent Discord Router for agent-to-Discord message routing
// Must be imported after DiscordBotService is initialized
const { AgentDiscordRouter } = await import('./services/agent-discord-router.js');
const agentDiscordRouter = new AgentDiscordRouter(events, discordBotService, roleRegistryService);
agentDiscordRouter.start();

// Initialize Scheduler Service with event emitter and data directory
const schedulerService = getSchedulerService();
schedulerService.initialize(events, DATA_DIR);
void schedulerService
  .start()
  .then(() => {
    // Register preset maintenance tasks after scheduler is ready
    return registerMaintenanceTasks(
      schedulerService,
      events,
      autoModeService,
      featureHealthService,
      avaGatewayService,
      integrityWatchdogService,
      featureLoader,
      settingsService
    );
  })
  .catch((err) => {
    logger.error('Scheduler startup or maintenance task registration failed:', err);
  });

// Initialize Health Monitor Service event emitter
healthMonitorService.setEventEmitter(events);

// Initialize Ava Gateway Service for heartbeat monitoring
void avaGatewayService.initialize(events, REPO_ROOT).catch((err) => {
  logger.error('Ava Gateway Service initialization failed:', err);
});

// Initialize Spec Generation Monitor for detecting and cleaning up stalled spec regeneration jobs
const specGenerationMonitor = getSpecGenerationMonitor(events, {
  checkIntervalMs: 30000, // Check every 30 seconds
  stallThresholdMs: 5 * 60 * 1000, // 5 minutes of inactivity
  enabled: true,
});
specGenerationMonitor.startMonitoring();

// Initialize services
(async () => {
  // Migrate settings from legacy Electron userData location if needed
  // This handles users upgrading from versions that stored settings in ~/.config/Automaker (Linux),
  // ~/Library/Application Support/Automaker (macOS), or %APPDATA%\Automaker (Windows)
  // to the new shared ./data directory
  try {
    const migrationResult = await settingsService.migrateFromLegacyElectronPath();
    if (migrationResult.migrated) {
      logger.info(`Settings migrated from legacy location: ${migrationResult.legacyPath}`);
      logger.info(`Migrated files: ${migrationResult.migratedFiles.join(', ')}`);
    }
    if (migrationResult.errors.length > 0) {
      logger.warn('Migration errors:', migrationResult.errors);
    }
  } catch (err) {
    logger.warn('Failed to check for legacy settings migration:', err);
  }

  // Apply logging settings from saved settings
  try {
    const settings = await settingsService.getGlobalSettings();
    if (settings.serverLogLevel && LOG_LEVEL_MAP[settings.serverLogLevel] !== undefined) {
      setLogLevel(LOG_LEVEL_MAP[settings.serverLogLevel]);
      logger.info(`Server log level set to: ${settings.serverLogLevel}`);
    }
    // Apply request logging setting (default true if not set)
    const enableRequestLog = settings.enableRequestLogging ?? true;
    setRequestLoggingEnabled(enableRequestLog);
    logger.info(`HTTP request logging: ${enableRequestLog ? 'enabled' : 'disabled'}`);
  } catch (err) {
    logger.warn('Failed to load logging settings, using defaults');
  }

  await agentService.initialize();
  logger.info('Agent service initialized');

  // Recover orphaned features (stuck in running/in-progress with no agent after restart)
  try {
    const settings = await settingsService.getGlobalSettings();
    const projectPaths = [
      ...(settings.autoModeAlwaysOn?.projects?.map((p) => p.projectPath) ?? []),
    ];
    // Deduplicate
    const uniquePaths = [...new Set(projectPaths)];

    for (const projectPath of uniquePaths) {
      try {
        const features = await featureLoader.getAll(projectPath);
        const orphaned = features.filter(
          (f) =>
            f.status === 'running' ||
            f.status === 'in_progress' ||
            (f.status && f.status.startsWith('pipeline_'))
        );

        for (const feature of orphaned) {
          logger.info(
            `[ORPHAN-RECOVERY] Resetting orphaned feature "${feature.title || feature.id}" from "${feature.status}" to "backlog"`,
            { projectPath, featureId: feature.id }
          );
          await featureLoader.update(projectPath, feature.id, {
            status: 'backlog',
            startedAt: undefined,
          });
        }

        if (orphaned.length > 0) {
          logger.info(
            `[ORPHAN-RECOVERY] Reset ${orphaned.length} orphaned feature(s) for ${projectPath}`
          );
        }
      } catch (err) {
        logger.warn(`[ORPHAN-RECOVERY] Failed to check features for ${projectPath}:`, err);
      }
    }
  } catch (err) {
    logger.warn('[ORPHAN-RECOVERY] Failed to run orphan recovery:', err);
  }

  // Run startup worktree recovery (prune phantom worktrees before auto-mode starts)
  try {
    const settings = await settingsService.getGlobalSettings();
    const projectPaths = [
      ...(settings.autoModeAlwaysOn?.projects?.map((p) => p.projectPath) ?? []),
    ];
    // Deduplicate
    const uniquePaths = [...new Set(projectPaths)];

    if (uniquePaths.length > 0) {
      logger.info(
        `[STARTUP-RECOVERY] Running worktree recovery for ${uniquePaths.length} project(s)...`
      );

      for (const projectPath of uniquePaths) {
        try {
          // Register project for periodic monitoring
          worktreeLifecycleService.registerProject(projectPath);

          // Prune phantom worktrees
          await worktreeLifecycleService.prunePhantomWorktrees(projectPath);

          // Detect any remaining drift
          const drift = await worktreeLifecycleService.detectDrift(projectPath);

          if (drift.phantoms.length > 0 || drift.orphans.length > 0) {
            logger.warn(`[STARTUP-RECOVERY] Drift detected in ${projectPath}:`, {
              phantoms: drift.phantoms.length,
              orphans: drift.orphans.length,
              healthy: drift.healthy,
            });
          } else {
            logger.info(
              `[STARTUP-RECOVERY] No drift detected in ${projectPath} (${drift.healthy} healthy worktrees)`
            );
          }
        } catch (err) {
          logger.warn(`[STARTUP-RECOVERY] Failed recovery for ${projectPath}:`, err);
        }
      }

      logger.info('[STARTUP-RECOVERY] Worktree recovery complete');
    }
  } catch (err) {
    logger.warn('[STARTUP-RECOVERY] Failed to run startup recovery:', err);
  }

  // Auto-start auto-mode if enabled in settings
  try {
    const settings = await settingsService.getGlobalSettings();
    if (settings.autoModeAlwaysOn?.enabled && settings.autoModeAlwaysOn.projects.length > 0) {
      logger.info(
        `[AUTO-START] Auto-mode always-on enabled for ${settings.autoModeAlwaysOn.projects.length} project(s), starting auto-mode...`
      );

      // Start auto-mode for each configured project
      for (const projectConfig of settings.autoModeAlwaysOn.projects) {
        try {
          const { projectPath, branchName, maxConcurrency } = projectConfig;
          const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';

          logger.info(`[AUTO-START] Starting auto-mode for ${worktreeDesc} in ${projectPath}...`);

          const resolvedMaxConcurrency = await autoModeService.startAutoLoopForProject(
            projectPath,
            branchName ?? null,
            maxConcurrency
          );

          logger.info(
            `[AUTO-START] Auto-mode started successfully for ${worktreeDesc} in ${projectPath} with maxConcurrency: ${resolvedMaxConcurrency}`
          );
        } catch (err) {
          // If auto-mode is already running, that's OK (might have been restored from state)
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.includes('already running')) {
            logger.info(
              `[AUTO-START] Auto-mode already running for ${projectConfig.projectPath}, skipping auto-start`
            );
          } else {
            logger.error(
              `[AUTO-START] Failed to start auto-mode for ${projectConfig.projectPath}:`,
              err
            );
          }
        }
      }
    } else if (settings.autoModeAlwaysOn?.enabled) {
      logger.info(
        '[AUTO-START] Auto-mode always-on enabled but no projects configured, skipping auto-start'
      );
    } else {
      logger.info('[AUTO-START] Auto-mode always-on disabled, skipping auto-start');
    }
  } catch (err) {
    logger.warn('[AUTO-START] Failed to check auto-mode always-on setting:', err);
  }

  // Bootstrap Codex model cache in background (don't block server startup)
  void codexModelCacheService.getModels().catch((err) => {
    logger.error('Failed to bootstrap Codex model cache:', err);
  });

  // Start health monitoring after all services are fully initialized
  healthMonitorService.startMonitoring();
})();

// Run stale validation cleanup every hour to prevent memory leaks from crashed validations
const VALIDATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const cleaned = cleanupStaleValidations();
  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} stale validation entries`);
  }
}, VALIDATION_CLEANUP_INTERVAL_MS);

// Initialize Graphite sync scheduler for nightly branch syncing
const graphiteSyncScheduler = new GraphiteSyncScheduler(
  settingsService,
  graphiteService,
  REPO_ROOT
);

// Schedule periodic Graphite sync at 2am daily (0 2 * * *)
// This keeps all feature branches in sync with their parent branches
const GRAPHITE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const GRAPHITE_SYNC_INITIAL_DELAY_MS = calculateNextSyncDelay();

// Run first sync after initial delay, then every 24 hours
const graphiteSyncHandle = setTimeout(() => {
  logger.info('Running scheduled Graphite sync (first run after startup)');
  void graphiteSyncScheduler.runSync().catch((err) => {
    logger.error('Scheduled Graphite sync failed:', err);
  });

  // Reschedule for every 24 hours after the first run
  setInterval(() => {
    logger.info('Running scheduled Graphite sync (nightly)');
    void graphiteSyncScheduler.runSync().catch((err) => {
      logger.error('Scheduled Graphite sync failed:', err);
    });
  }, GRAPHITE_SYNC_INTERVAL_MS);
}, GRAPHITE_SYNC_INITIAL_DELAY_MS);

logger.info(
  `Graphite sync scheduler initialized (next run in ${(GRAPHITE_SYNC_INITIAL_DELAY_MS / 1000 / 60).toFixed(1)} minutes)`
);

/**
 * Calculate milliseconds until next 2am UTC
 * This implements the cron schedule "0 2 * * *" (2am daily)
 */
function calculateNextSyncDelay(): number {
  const now = new Date();
  const next = new Date(now);

  // Set to 2am UTC
  next.setUTCHours(2, 0, 0, 0);

  // If 2am has already passed today, schedule for tomorrow
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  const delayMs = next.getTime() - now.getTime();
  logger.debug(`Next Graphite sync scheduled for ${next.toISOString()}`);
  return delayMs;
}

// Require Content-Type: application/json for all API POST/PUT/PATCH requests
// This helps prevent CSRF and content-type confusion attacks
app.use('/api', requireJsonContentType);

// Mount unauthenticated routes
app.use('/api/health', createHealthRoutes());
app.use('/api/auth', createAuthRoutes());
app.use('/api/setup', createSetupRoutes(settingsService));

// Mount webhooks at root level (unauthenticated - uses signature verification)
app.use('/webhooks', createWebhooksRoutes(events, settingsService));

// Apply authentication to all /api/* routes
app.use('/api', authMiddleware);

// Protected health endpoints with detailed info
app.get('/api/health/detailed', createDetailedHandler());
app.get('/api/health/quick', createQuickHandler());
app.get(
  '/api/health/standard',
  createStandardHandler(agentService, featureLoader, autoModeService, REPO_ROOT)
);
app.get(
  '/api/health/deep',
  createDeepHandler(agentService, featureLoader, autoModeService, REPO_ROOT)
);

app.use('/api/fs', createFsRoutes(events));
app.use('/api/agent', createAgentRoutes(agentService, events));
app.use('/api/sessions', createSessionsRoutes(agentService));
app.use(
  '/api/features',
  createFeaturesRoutes(
    featureLoader,
    settingsService,
    events,
    authorityService,
    featureHealthService
  )
);
app.use('/api/projects', createProjectsRoutes(featureLoader));
app.use('/api/auto-mode', createAutoModeRoutes(autoModeService));
app.use('/api/enhance-prompt', createEnhancePromptRoutes(settingsService));
app.use(
  '/api/worktree',
  createWorktreeRoutes(events, settingsService, worktreeLifecycleService, autoModeService)
);
app.use('/api/git', createGitRoutes());
app.use('/api/suggestions', createSuggestionsRoutes(events, settingsService));
app.use('/api/models', createModelsRoutes());
app.use('/api/spec-regeneration', createSpecRegenerationRoutes(events, settingsService));
app.use('/api/running-agents', createRunningAgentsRoutes(autoModeService));
app.use('/api/workspace', createWorkspaceRoutes());
app.use('/api/templates', createTemplatesRoutes());
app.use('/api/terminal', createTerminalRoutes());
app.use('/api/settings', createSettingsRoutes(settingsService));
app.use('/api/claude', createClaudeRoutes(claudeUsageService));
app.use('/api/codex', createCodexRoutes(codexUsageService, codexModelCacheService));
app.use('/api/github', createGitHubRoutes(events, settingsService));
app.use('/api/context', createContextRoutes(settingsService));
app.use('/api/backlog-plan', createBacklogPlanRoutes(events, settingsService));
app.use('/api/beads', createBeadsRoutes(beadsService));
app.use('/api/mcp', createMCPRoutes(mcpTestService));
app.use('/api/integrations', authMiddleware, createIntegrationRoutes(settingsService));
app.use(
  '/api/authority',
  authMiddleware,
  createAuthorityRoutes(
    authorityService,
    events,
    featureLoader,
    {
      pm: pmAgent,
      projm: projmAgent,
      em: emAgent,
      statusMonitor,
    },
    auditService
  )
);
app.use(
  '/api/cos',
  authMiddleware,
  createCosRoutes(events, featureLoader, {
    pm: pmAgent,
    projm: projmAgent,
    em: emAgent,
    statusMonitor,
  })
);
app.use('/api/pipeline', createPipelineRoutes(pipelineService));
app.use('/api/metrics', createMetricsRoutes(metricsService));
app.use('/api/ideation', createIdeationRoutes(events, ideationService, featureLoader));
app.use('/api/notifications', createNotificationsRoutes(notificationService));
app.use('/api/ralph', createRalphRoutes(ralphLoopService));
app.use('/api/skills', createSkillsRoutes());
app.use('/api/event-history', createEventHistoryRoutes(eventHistoryService, settingsService));
app.use(
  '/api/briefing',
  authMiddleware,
  createBriefingRoutes(eventHistoryService, briefingCursorService)
);
app.use('/api/projects', createProjectsRoutes(featureLoader));
app.use('/api/scheduler', createSchedulerRoutes(schedulerService));
app.use('/api/ava', createAvaRoutes(avaGatewayService));
app.use('/api/discord', createDiscordRoutes(discordBotService));
app.use(
  '/api/agents',
  createAgentManagementRoutes(roleRegistryService, agentFactoryService, dynamicAgentExecutor)
);

// Create HTTP server
const server = createServer(app);

// WebSocket servers using noServer mode for proper multi-path support
const wss = new WebSocketServer({ noServer: true });
const terminalWss = new WebSocketServer({ noServer: true });
const terminalService = getTerminalService();

/**
 * Authenticate WebSocket upgrade requests
 * Checks for API key in header/query, session token in header/query, OR valid session cookie
 */
function authenticateWebSocket(request: import('http').IncomingMessage): boolean {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  // Convert URL search params to query object
  const query: Record<string, string | undefined> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Parse cookies from header
  const cookieHeader = request.headers.cookie;
  const cookies = cookieHeader ? cookie.parse(cookieHeader) : {};

  // Use shared authentication logic for standard auth methods
  if (
    checkRawAuthentication(
      request.headers as Record<string, string | string[] | undefined>,
      query,
      cookies
    )
  ) {
    return true;
  }

  // Additionally check for short-lived WebSocket connection token (WebSocket-specific)
  const wsToken = url.searchParams.get('wsToken');
  if (wsToken && validateWsConnectionToken(wsToken)) {
    return true;
  }

  return false;
}

// Handle HTTP upgrade requests manually to route to correct WebSocket server
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

  // Authenticate all WebSocket connections
  if (!authenticateWebSocket(request)) {
    logger.info('Authentication failed, rejecting connection');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  if (pathname === '/api/events') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/terminal/ws') {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Events WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  logger.info('Client connected, ready state:', ws.readyState);

  // WebSocket backpressure threshold (256KB)
  const WS_BACKPRESSURE_THRESHOLD = 256 * 1024;

  // Subscribe to all events and forward to this client
  const unsubscribe = events.subscribe((type, payload) => {
    logger.info('Event received:', {
      type,
      hasPayload: !!payload,
      payloadKeys: payload ? Object.keys(payload) : [],
      wsReadyState: ws.readyState,
      wsOpen: ws.readyState === WebSocket.OPEN,
    });

    if (ws.readyState === WebSocket.OPEN) {
      try {
        // Check backpressure before sending
        if (ws.bufferedAmount > WS_BACKPRESSURE_THRESHOLD) {
          logger.warn('WebSocket backpressure detected, dropping event:', {
            type,
            bufferedAmount: ws.bufferedAmount,
            threshold: WS_BACKPRESSURE_THRESHOLD,
          });
          return;
        }

        const message = JSON.stringify({ type, payload });
        logger.info('Sending event to client:', {
          type,
          messageLength: message.length,
          sessionId: (payload as any)?.sessionId,
          bufferedAmount: ws.bufferedAmount,
        });
        ws.send(message);
      } catch (err) {
        logger.warn('Failed to send WebSocket message:', {
          type,
          error: (err as Error).message,
        });
      }
    } else {
      logger.info('WARNING: Cannot send event, WebSocket not open. ReadyState:', ws.readyState);
    }
  });

  ws.on('close', () => {
    logger.info('Client disconnected');
    unsubscribe();
  });

  ws.on('error', (error) => {
    logger.error('ERROR:', error);
    unsubscribe();
  });
});

// Track WebSocket connections per session
const terminalConnections: Map<string, Set<WebSocket>> = new Map();
// Track last resize dimensions per session to deduplicate resize messages
const lastResizeDimensions: Map<string, { cols: number; rows: number }> = new Map();
// Track last resize timestamp to rate-limit resize operations (prevents resize storm)
const lastResizeTime: Map<string, number> = new Map();
const RESIZE_MIN_INTERVAL_MS = 100; // Minimum 100ms between resize operations

// Clean up resize tracking when sessions actually exit (not just when connections close)
terminalService.onExit((sessionId) => {
  lastResizeDimensions.delete(sessionId);
  lastResizeTime.delete(sessionId);
  terminalConnections.delete(sessionId);
});

// Terminal WebSocket connection handler
terminalWss.on('connection', (ws: WebSocket, req: import('http').IncomingMessage) => {
  // Parse URL to get session ID and token
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const token = url.searchParams.get('token');

  logger.info(`Connection attempt for session: ${sessionId}`);

  // Check if terminal is enabled
  if (!isTerminalEnabled()) {
    logger.info('Terminal is disabled');
    ws.close(4003, 'Terminal access is disabled');
    return;
  }

  // Validate token if password is required
  if (isTerminalPasswordRequired() && !validateTerminalToken(token || undefined)) {
    logger.info('Invalid or missing token');
    ws.close(4001, 'Authentication required');
    return;
  }

  if (!sessionId) {
    logger.info('No session ID provided');
    ws.close(4002, 'Session ID required');
    return;
  }

  // Check if session exists
  const session = terminalService.getSession(sessionId);
  if (!session) {
    logger.info(`Session ${sessionId} not found`);
    ws.close(4004, 'Session not found');
    return;
  }

  logger.info(`Client connected to session ${sessionId}`);

  // Track this connection
  if (!terminalConnections.has(sessionId)) {
    terminalConnections.set(sessionId, new Set());
  }
  terminalConnections.get(sessionId)!.add(ws);

  // Send initial connection success FIRST
  ws.send(
    JSON.stringify({
      type: 'connected',
      sessionId,
      shell: session.shell,
      cwd: session.cwd,
    })
  );

  // Send scrollback buffer BEFORE subscribing to prevent race condition
  // Also clear pending output buffer to prevent duplicates from throttled flush
  const scrollback = terminalService.getScrollbackAndClearPending(sessionId);
  if (scrollback && scrollback.length > 0) {
    ws.send(
      JSON.stringify({
        type: 'scrollback',
        data: scrollback,
      })
    );
  }

  // NOW subscribe to terminal data (after scrollback is sent)
  const unsubscribeData = terminalService.onData((sid, data) => {
    if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  });

  // Subscribe to terminal exit
  const unsubscribeExit = terminalService.onExit((sid, exitCode) => {
    if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close(1000, 'Session ended');
    }
  });

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.type) {
        case 'input':
          // Validate input data type and length
          if (typeof msg.data !== 'string') {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid input type' }));
            break;
          }
          // Limit input size to 1MB to prevent memory issues
          if (msg.data.length > 1024 * 1024) {
            ws.send(JSON.stringify({ type: 'error', message: 'Input too large' }));
            break;
          }
          // Write user input to terminal
          terminalService.write(sessionId, msg.data);
          break;

        case 'resize':
          // Validate resize dimensions are positive integers within reasonable bounds
          if (
            typeof msg.cols !== 'number' ||
            typeof msg.rows !== 'number' ||
            !Number.isInteger(msg.cols) ||
            !Number.isInteger(msg.rows) ||
            msg.cols < 1 ||
            msg.cols > 1000 ||
            msg.rows < 1 ||
            msg.rows > 500
          ) {
            break; // Silently ignore invalid resize requests
          }
          // Resize terminal with deduplication and rate limiting
          if (msg.cols && msg.rows) {
            const now = Date.now();
            const lastTime = lastResizeTime.get(sessionId) || 0;
            const lastDimensions = lastResizeDimensions.get(sessionId);

            // Skip if resized too recently (prevents resize storm during splits)
            if (now - lastTime < RESIZE_MIN_INTERVAL_MS) {
              break;
            }

            // Check if dimensions are different from last resize
            if (
              !lastDimensions ||
              lastDimensions.cols !== msg.cols ||
              lastDimensions.rows !== msg.rows
            ) {
              // Only suppress output on subsequent resizes, not the first one
              // The first resize happens on terminal open and we don't want to drop the initial prompt
              const isFirstResize = !lastDimensions;
              terminalService.resize(sessionId, msg.cols, msg.rows, !isFirstResize);
              lastResizeDimensions.set(sessionId, {
                cols: msg.cols,
                rows: msg.rows,
              });
              lastResizeTime.set(sessionId, now);
            }
          }
          break;

        case 'ping':
          // Respond to ping
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          logger.warn(`Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      logger.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    logger.info(`Client disconnected from session ${sessionId}`);
    unsubscribeData();
    unsubscribeExit();

    // Remove from connections tracking
    const connections = terminalConnections.get(sessionId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        terminalConnections.delete(sessionId);
        // DON'T delete lastResizeDimensions/lastResizeTime here!
        // The session still exists, and reconnecting clients need to know
        // this isn't the "first resize" to prevent duplicate prompts.
        // These get cleaned up when the session actually exits.
      }
    }
  });

  ws.on('error', (error) => {
    logger.error(`Error on session ${sessionId}:`, error);
    unsubscribeData();
    unsubscribeExit();
  });
});

// Start server with error handling for port conflicts
const startServer = (port: number, host: string) => {
  server.listen(port, host, () => {
    const terminalStatus = isTerminalEnabled()
      ? isTerminalPasswordRequired()
        ? 'enabled (password protected)'
        : 'enabled'
      : 'disabled';

    // Build URLs for display
    const listenAddr = `${host}:${port}`;
    const httpUrl = `http://${HOSTNAME}:${port}`;
    const wsEventsUrl = `ws://${HOSTNAME}:${port}/api/events`;
    const wsTerminalUrl = `ws://${HOSTNAME}:${port}/api/terminal/ws`;
    const healthUrl = `http://${HOSTNAME}:${port}/api/health`;

    const sHeader = '🚀 Automaker Backend Server'.padEnd(BOX_CONTENT_WIDTH);
    const s1 = `Listening:    ${listenAddr}`.padEnd(BOX_CONTENT_WIDTH);
    const s2 = `HTTP API:     ${httpUrl}`.padEnd(BOX_CONTENT_WIDTH);
    const s3 = `WebSocket:    ${wsEventsUrl}`.padEnd(BOX_CONTENT_WIDTH);
    const s4 = `Terminal WS:  ${wsTerminalUrl}`.padEnd(BOX_CONTENT_WIDTH);
    const s5 = `Health:       ${healthUrl}`.padEnd(BOX_CONTENT_WIDTH);
    const s6 = `Terminal:     ${terminalStatus}`.padEnd(BOX_CONTENT_WIDTH);

    logger.info(`
╔═════════════════════════════════════════════════════════════════════╗
║  ${sHeader}║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║  ${s1}║
║  ${s2}║
║  ${s3}║
║  ${s4}║
║  ${s5}║
║  ${s6}║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      const portStr = port.toString();
      const nextPortStr = (port + 1).toString();
      const killCmd = `lsof -ti:${portStr} | xargs kill -9`;
      const altCmd = `PORT=${nextPortStr} npm run dev:server`;

      const eHeader = `❌ ERROR: Port ${portStr} is already in use`.padEnd(BOX_CONTENT_WIDTH);
      const e1 = 'Another process is using this port.'.padEnd(BOX_CONTENT_WIDTH);
      const e2 = 'To fix this, try one of:'.padEnd(BOX_CONTENT_WIDTH);
      const e3 = '1. Kill the process using the port:'.padEnd(BOX_CONTENT_WIDTH);
      const e4 = `   ${killCmd}`.padEnd(BOX_CONTENT_WIDTH);
      const e5 = '2. Use a different port:'.padEnd(BOX_CONTENT_WIDTH);
      const e6 = `   ${altCmd}`.padEnd(BOX_CONTENT_WIDTH);
      const e7 = '3. Use the init.sh script which handles this:'.padEnd(BOX_CONTENT_WIDTH);
      const e8 = '   ./init.sh'.padEnd(BOX_CONTENT_WIDTH);

      logger.error(`
╔═════════════════════════════════════════════════════════════════════╗
║  ${eHeader}║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║  ${e1}║
║                                                                     ║
║  ${e2}║
║                                                                     ║
║  ${e3}║
║  ${e4}║
║                                                                     ║
║  ${e5}║
║  ${e6}║
║                                                                     ║
║  ${e7}║
║  ${e8}║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
`);
      process.exit(1);
    } else {
      logger.error('Error starting server:', error);
      process.exit(1);
    }
  });
};

startServer(PORT, HOST);

// Global error handlers to prevent crashes from uncaught errors
process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Don't exit - log the error and continue running
  // This prevents the server from crashing due to unhandled rejections
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
  });

  // Known non-fatal errors: log and continue instead of crashing
  const nonFatalCodes = [
    'ECONNRESET',
    'EPIPE',
    'ERR_STREAM_DESTROYED',
    'ERR_STREAM_WRITE_AFTER_END',
  ];
  const errorCode = (error as NodeJS.ErrnoException).code;
  if (errorCode && nonFatalCodes.includes(errorCode)) {
    logger.warn(`Non-fatal uncaught exception (${errorCode}), continuing...`);
    return;
  }

  // For truly fatal exceptions: attempt graceful shutdown with timeout
  logger.error('Fatal uncaught exception — initiating graceful shutdown...');
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimeout.unref(); // Don't keep process alive just for this timer

  gracefulShutdown()
    .catch((err) => logger.error('Shutdown failed during uncaught exception handling:', err))
    .finally(() => process.exit(1));
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down gracefully...');

  await autoModeService.shutdown();
  healthMonitorService.stopMonitoring();
  schedulerService.stop();
  terminalService.cleanup();
  worktreeLifecycleService.shutdown();

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

// Signal handlers stay sync, call async gracefulShutdown
process.on('SIGTERM', () => {
  gracefulShutdown().catch((err) => {
    logger.error('Shutdown failed:', err);
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  gracefulShutdown().catch((err) => {
    logger.error('Shutdown failed:', err);
    process.exit(1);
  });
});
