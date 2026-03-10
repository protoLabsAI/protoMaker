// Startup sequence: settings migration, reconciliation, worktree recovery, auto-mode start, Codex cache

import { access, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger, setLogLevel, LogLevel } from '@protolabsai/utils';

import type { ServiceContainer } from './services.js';
import { initOtel } from '../lib/otel.js';

const logger = createLogger('Server:Startup');

/**
 * Map server log level string to LogLevel enum
 */
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
};

/**
 * Run async initialization: settings migration, knowledge store setup, feature reconciliation,
 * worktree recovery, crash detection, auto-mode start, Codex cache warm-up.
 */
export async function runStartup(
  services: ServiceContainer,
  setRequestLoggingEnabled: (enabled: boolean) => void
): Promise<void> {
  await initOtel();

  const {
    settingsService,
    featureLoader: _featureLoader,
    autoModeService,
    prFeedbackService,
    leadEngineerService,
    worktreeLifecycleService,
    agentService,
    knowledgeStoreService,
    crdtSyncService,
    projectAssignmentService,
    dataDir,
    repoRoot,
  } = services;

  // Migrate settings from legacy Electron userData location if needed
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
  } catch (_err) {
    logger.warn('Failed to load logging settings, using defaults');
  }

  await agentService.initialize();
  logger.info('Agent service initialized');

  // Start CRDT sync service (multi-instance coordination)
  try {
    await crdtSyncService.start(repoRoot);
    logger.info('[CRDT] Sync service started');
  } catch (err) {
    logger.warn('[CRDT] Sync service failed to start (single-instance mode):', err);
  }

  // Claim preferred projects at boot (reads projectPreferences from proto.config.yaml)
  try {
    const claimed = await projectAssignmentService.claimPreferredProjects(repoRoot);
    if (claimed.length > 0) {
      logger.info(
        `[ASSIGN] Claimed ${claimed.length} preferred project(s) at boot: ${claimed.join(', ')}`
      );
    }
  } catch (err) {
    logger.warn('[ASSIGN] Failed to claim preferred projects at boot:', err);
  }

  // Initialize CRDT document store and inject into services
  // Must run after CrdtSyncService.start() so proto.config.yaml is loaded
  try {
    const { register: registerCrdtStore } = await import('../services/crdt-store.module.js');
    const result = await registerCrdtStore(services);
    if (result) {
      services._crdtStore = result.store;
      services._crdtStoreCleanup = result.close;
      logger.info('[CRDT] Document store initialized and injected into services');
    }
  } catch (err) {
    logger.warn('[CRDT] Document store failed to initialize (filesystem fallback):', err);
  }

  // Initialize Ava Channel Reactor (depends on crdt-store.module having run first)
  try {
    const { register: registerAvaChannelReactor } =
      await import('../services/ava-channel-reactor.module.js');
    const result = await registerAvaChannelReactor(services);
    if (result) {
      services.avaChannelReactorService = result.service;
      services._avaChannelReactorStop = result.stop;
      logger.info('[REACTOR] Ava Channel Reactor started');
    }
  } catch (err) {
    logger.warn('[REACTOR] Ava Channel Reactor failed to start:', err);
  }

  // Initialize Knowledge Store Service for all known projects
  if (knowledgeStoreService) {
    try {
      const settings = await settingsService.getGlobalSettings();
      const projectPaths = [
        // All projects registered in the project list
        ...(settings.projects?.map((p) => p.path) ?? []),
        // Additionally, any autoModeAlwaysOn projects (may not be in project list)
        ...(settings.autoModeAlwaysOn?.projects?.map((p) => p.projectPath) ?? []),
      ];
      const uniquePaths = [...new Set(projectPaths)];

      for (const projectPath of uniquePaths) {
        try {
          knowledgeStoreService.initialize(projectPath);
          logger.info(`[KNOWLEDGE] Initialized knowledge store for ${projectPath}`);

          const stats = knowledgeStoreService.getStats();
          if (stats.totalChunks === 0) {
            logger.info(`[KNOWLEDGE] Rebuilding index for ${projectPath} (no existing data)`);
            knowledgeStoreService.rebuildIndex(projectPath);
            logger.info(`[KNOWLEDGE] Index rebuild complete for ${projectPath}`);
          }
        } catch (err) {
          logger.warn(`[KNOWLEDGE] Failed to initialize knowledge store for ${projectPath}:`, err);
        }
      }
    } catch (err) {
      logger.warn('[KNOWLEDGE] Failed to initialize knowledge stores:', err);
    }
  }

  // Wire reflection completion → knowledge store reindex (keeps FTS5 search up-to-date)
  if (knowledgeStoreService) {
    services.events.subscribe((type, payload) => {
      if (type === 'feature:reflection:complete') {
        const data = payload as { projectPath?: string };
        if (data.projectPath) {
          try {
            knowledgeStoreService.ingestReflections(data.projectPath);
            knowledgeStoreService.rebuildIndex(data.projectPath);
            logger.info(`[KNOWLEDGE] Reindexed reflections for ${data.projectPath}`);
          } catch (err) {
            logger.warn('[KNOWLEDGE] Failed to reindex reflections:', err);
          }
        }
      }
    });
  }

  // Ensure default projects exist (e.g., the persistent "bugs" project)
  try {
    const settings = await settingsService.getGlobalSettings();
    const projectPaths = [
      ...(settings.projects?.map((p) => p.path) ?? []),
      ...(settings.autoModeAlwaysOn?.projects?.map((p) => p.projectPath) ?? []),
    ];
    const uniquePaths = [...new Set(projectPaths)];

    for (const projectPath of uniquePaths) {
      try {
        await services.projectService.ensureBugsProject(projectPath);
      } catch (err) {
        logger.warn(`[STARTUP] Failed to ensure bugs project for ${projectPath}:`, err);
      }
      try {
        await services.projectService.ensureSystemImprovementsProject(projectPath);
      } catch (err) {
        logger.warn(
          `[STARTUP] Failed to ensure system-improvements project for ${projectPath}:`,
          err
        );
      }
    }
  } catch (err) {
    logger.warn('[STARTUP] Failed to ensure default projects:', err);
  }

  // Reconcile stuck features (in_progress, interrupted, pipeline_* with no running agent)
  try {
    const settings = await settingsService.getGlobalSettings();
    const projectPaths = [
      ...(settings.autoModeAlwaysOn?.projects?.map((p) => p.projectPath) ?? []),
    ];
    const uniquePaths = [...new Set(projectPaths)];

    for (const projectPath of uniquePaths) {
      try {
        const result = await autoModeService.reconcileFeatureStates(projectPath);
        if (result.reconciled.length > 0) {
          logger.info(
            `[STARTUP] Reconciled ${result.reconciled.length} stuck feature(s) for ${projectPath}`
          );
        }
      } catch (err) {
        logger.warn(`[STARTUP] Failed to reconcile features for ${projectPath}:`, err);
      }
    }

    // Reconcile orphaned checkpoints (runs after feature state reconciliation)
    for (const projectPath of uniquePaths) {
      try {
        const result = await leadEngineerService.reconcileCheckpoints(projectPath);
        if (result.deleted.length > 0) {
          logger.info(
            `[STARTUP] Deleted ${result.deleted.length} orphaned checkpoint(s) for ${projectPath}`
          );
        }
      } catch (err) {
        logger.warn(`[STARTUP] Failed to reconcile checkpoints for ${projectPath}:`, err);
      }
    }
  } catch (err) {
    logger.warn('[STARTUP] Failed to run feature reconciliation:', err);
  }

  // Run startup worktree recovery (prune phantom worktrees before auto-mode starts)
  try {
    const settings = await settingsService.getGlobalSettings();
    const projectPaths = [
      ...(settings.autoModeAlwaysOn?.projects?.map((p) => p.projectPath) ?? []),
    ];
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

  // Crash detection: check for clean shutdown marker
  const cleanShutdownMarker = join(dataDir, '.clean-shutdown');
  let wasCleanShutdown = false;
  try {
    await access(cleanShutdownMarker);
    wasCleanShutdown = true;
    await unlink(cleanShutdownMarker); // Remove it — next crash won't have it
    logger.info('[AUTO-START] Clean shutdown marker found — previous shutdown was graceful');
  } catch {
    // No marker = crash recovery
  }

  if (!wasCleanShutdown) {
    const crashDelayMs = process.env.AUTO_MODE_CRASH_DELAY_MS || '30000';
    logger.warn(
      `[AUTO-START] Previous shutdown was not clean (crash detected). Using ${crashDelayMs}ms cooldown for auto-mode.`
    );
    // Override startup delay with longer crash delay
    process.env.AUTO_MODE_STARTUP_DELAY_MS = crashDelayMs;
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

          // Restore tracked PRs for this project
          await prFeedbackService.restoreTrackedPRsForProject(projectPath);
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
}
