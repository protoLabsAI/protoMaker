// Startup sequence: settings migration, reconciliation, worktree recovery, auto-mode start, Codex cache

import { access, unlink, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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
 * One-time migration: move runtime state files from .automaker/ into DATA_DIR.
 * Safe to run multiple times — skips files that don't exist at old location.
 */
async function migrateRuntimeStateFiles(repoRoot: string, dataDir: string): Promise<void> {
  const moves: Array<{ from: string; to: string }> = [
    {
      from: join(repoRoot, '.automaker', 'metrics', 'dora.json'),
      to: join(dataDir, 'metrics', 'dora.json'),
    },
    {
      from: join(repoRoot, '.automaker', 'metrics', 'error-budget.json'),
      to: join(dataDir, 'metrics', 'error-budget.json'),
    },
    {
      from: join(repoRoot, '.automaker', 'lead-engineer-sessions.json'),
      to: join(dataDir, 'lead-engineer-sessions.json'),
    },
    {
      from: join(repoRoot, 'apps', 'server', '.automaker', 'pr-tracking.json'),
      to: join(dataDir, 'pr-tracking.json'),
    },
  ];

  for (const { from, to } of moves) {
    try {
      await access(from); // Check exists
    } catch {
      continue; // Source doesn't exist — skip
    }
    try {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
      logger.info(`[MIGRATE] Moved ${from} → ${to}`);
    } catch (err) {
      logger.warn(`[MIGRATE] Failed to move ${from} → ${to}:`, err);
    }
  }
}

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
    worktreeLifecycleService,
    githubStateChecker,
    agentService,
    knowledgeStoreService,
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

  // Migrate runtime state files from .automaker/ to DATA_DIR
  try {
    await migrateRuntimeStateFiles(repoRoot, dataDir);
  } catch (err) {
    logger.warn('[MIGRATE] Runtime state migration failed:', err);
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
          await knowledgeStoreService.initialize(projectPath);
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
          // Register with GitHub state checker so drift detection runs for external projects
          githubStateChecker.registerProject(projectPath);

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

  // Auto-start / auto-resume auto-mode. Two sources decide which loops run after boot:
  //   1. Persisted execution state — any project whose loop was running at the last
  //      shutdown (execution-state.json with autoLoopWasRunning) resumes at its SAVED
  //      maxConcurrency. This delivers "set it and forget it": a deploy or crash
  //      transparently resumes the crew at the configured concurrency (see #3949).
  //   2. autoModeAlwaysOn config — projects explicitly configured to start on boot
  //      even if they weren't running before (concurrency resolved from settings).
  // Persisted-state entries win on overlap (they carry the configured concurrency).
  try {
    const settings = await settingsService.getGlobalSettings();

    // Candidate projects to inspect for persisted "was running" state: every
    // registered app plus any always-on project.
    const candidatePaths = [
      ...settings.projects.map((p) => p.path),
      ...(settings.autoModeAlwaysOn?.projects?.map((p) => p.projectPath) ?? []),
    ];
    const resumable = await autoModeService.listResumableLoops(candidatePaths);

    // Unified start list, keyed per worktree. maxConcurrency === undefined means
    // "resolve from settings" (always-on projects that weren't running before).
    const keyOf = (projectPath: string, branchName: string | null): string =>
      `${projectPath}::${branchName ?? '__main__'}`;
    const targets = new Map<
      string,
      {
        projectPath: string;
        branchName: string | null;
        maxConcurrency?: number;
        reason: 'resume' | 'always-on';
      }
    >();

    for (const loop of resumable) {
      targets.set(keyOf(loop.projectPath, loop.branchName), {
        projectPath: loop.projectPath,
        branchName: loop.branchName,
        maxConcurrency: loop.maxConcurrency,
        reason: 'resume',
      });
    }

    if (settings.autoModeAlwaysOn?.enabled) {
      for (const projectConfig of settings.autoModeAlwaysOn.projects) {
        const branchName = projectConfig.branchName ?? null;
        const key = keyOf(projectConfig.projectPath, branchName);
        if (!targets.has(key)) {
          targets.set(key, {
            projectPath: projectConfig.projectPath,
            branchName,
            reason: 'always-on',
          });
        }
      }
    }

    if (targets.size === 0) {
      logger.info(
        '[AUTO-START] No loops were running before restart and auto-mode always-on is off — nothing to start'
      );
    } else {
      logger.info(`[AUTO-START] Resolving ${targets.size} auto-mode loop(s) to start...`);
      for (const target of targets.values()) {
        const { projectPath, branchName, maxConcurrency, reason } = target;
        const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
        try {
          // Guard: skip start if the project has no ready backlog features.
          // Starting loops for idle projects wastes memory and contributes to OOM on
          // restart when multiple apps are configured. The loop can be started later
          // when new work arrives via the normal start-auto-mode API call.
          const hasWork = await autoModeService.hasReadyBacklogFeatures(projectPath);
          if (!hasWork) {
            logger.info(
              `[AUTO-START] No ready backlog features in ${projectPath} — skipping auto-mode start to conserve memory`
            );
            continue;
          }

          logger.info(
            `[AUTO-START] Starting auto-mode (${reason}) for ${worktreeDesc} in ${projectPath}...`
          );

          const resolvedMaxConcurrency = await autoModeService.startAutoLoopForProject(
            projectPath,
            branchName,
            false,
            maxConcurrency
          );

          logger.info(
            `[AUTO-START] Auto-mode started successfully for ${worktreeDesc} in ${projectPath} with maxConcurrency: ${resolvedMaxConcurrency}`
          );
        } catch (err) {
          // If auto-mode is already running, that's OK (might have been restored from state)
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.includes('already running')) {
            logger.info(`[AUTO-START] Auto-mode already running for ${projectPath}, skipping`);
          } else {
            logger.error(`[AUTO-START] Failed to start auto-mode for ${projectPath}:`, err);
          }
        }
      }
    }
  } catch (err) {
    logger.warn('[AUTO-START] Failed to resolve auto-mode startup state:', err);
  }
}
