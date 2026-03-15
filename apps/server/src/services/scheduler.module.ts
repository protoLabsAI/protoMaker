import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';
import { getAgentManifestService, WATCH_POLL_INTERVAL_MS } from './agent-manifest-service.js';
import {
  ARCHIVAL_CHECK_INTERVAL_MS,
  WORKTREE_DRIFT_CHECK_INTERVAL_MS,
} from '../config/timeouts.js';
import { getPRWatcherService } from './pr-watcher-service.js';

/** Polling interval for the builtin:electron-idle sensor (30 seconds) */
const ELECTRON_IDLE_POLL_MS = 30_000;

const logger = createLogger('Server:Wiring');

/**
 * Wires scheduler service initialization and registers automations + maintenance tasks.
 *
 * Delegates to automationService.syncWithScheduler() which:
 * 1. Registers built-in maintenance tasks
 * 2. Registers any user-defined cron automations from storage
 */
export function register(container: ServiceContainer): void {
  const {
    events,
    dataDir,
    settingsService,
    schedulerService,
    automationService,
    autoModeService,
    featureHealthService,
    integrityWatchdogService,
    featureLoader,
    archivalService,
    sensorRegistryService,
    worktreeLifecycleService,
    healthMonitorService,
    specGenerationMonitor,
    leadEngineerService,
    crdtSyncService,
  } = container;

  // Wire schedulerService into interval-tracked services so their timers
  // appear in schedulerService.listAll() and can be inspected centrally.
  healthMonitorService.setSchedulerService(schedulerService);
  specGenerationMonitor.setSchedulerService(schedulerService);
  leadEngineerService.setSchedulerService(schedulerService);
  crdtSyncService.setSchedulerService(schedulerService);
  const prWatcher = getPRWatcherService();
  if (prWatcher) {
    prWatcher.setSchedulerService(schedulerService);
  }

  // Scheduler Service initialization and task registration via AutomationService
  schedulerService.initialize(events, dataDir);
  schedulerService.setSettingsService(settingsService);
  void schedulerService
    .start()
    .then(async () => {
      await automationService.syncWithScheduler({
        events,
        autoModeService,
        featureHealthService,
        integrityWatchdogService,
        featureLoader,
        settingsService,
      });

      // Register calendar job executor — scans for due jobs every minute
      await schedulerService.registerTask(
        'job-executor:tick',
        'Calendar Job Executor',
        '* * * * *',
        () => container.jobExecutorService.tick(),
        true
      );

      // Register periodic Google Calendar sync — runs every 6 hours for all connected projects
      await schedulerService.registerTask(
        'google-calendar:sync',
        'Google Calendar Sync',
        '0 */6 * * *',
        async () => {
          const globalSettings = await settingsService.getGlobalSettings();
          const projects = globalSettings.projects ?? [];

          for (const project of projects) {
            const projectSettings = await settingsService.getProjectSettings(project.path);
            const google = projectSettings.integrations?.google;

            if (!google?.accessToken || !google?.refreshToken) {
              continue; // Google Calendar not connected for this project
            }

            try {
              const result = await container.googleCalendarSyncService.syncFromGoogle(project.path);
              logger.info('Scheduled Google Calendar sync complete', {
                projectPath: project.path,
                ...result,
              });
            } catch (err) {
              logger.error('Scheduled Google Calendar sync failed', {
                projectPath: project.path,
                err,
              });
            }
          }
        },
        true
      );

      // Initialize and register daily standup cron (every 15 minutes)
      container.dailyStandupService.initialize(
        settingsService,
        featureLoader,
        container.discordBotService,
        schedulerService,
        dataDir
      );
      await container.dailyStandupService.registerCronTask();

      // Apply taskOverrides from global settings after all tasks are registered
      await schedulerService.applySettingsOverrides();

      // ── Timer Registry: named interval registrations ──────────────────────
      // These replace the per-service setInterval() calls that previously lived
      // inside each service's start() / initialize() method.

      // WorktreeLifecycleService — 6-hour phantom/orphan drift detection
      schedulerService.registerInterval(
        'worktree-lifecycle:drift-check',
        'Worktree Drift Check',
        WORKTREE_DRIFT_CHECK_INTERVAL_MS,
        () => worktreeLifecycleService.runPeriodicDriftCheck()
      );

      // ArchivalService — 10-minute done-feature archival sweep
      schedulerService.registerInterval(
        'archival:check',
        'Feature Archival Check',
        ARCHIVAL_CHECK_INTERVAL_MS,
        () => archivalService.runArchivalCycle()
      );

      // SensorRegistryService — 30-second Electron idle time poll
      schedulerService.registerInterval(
        'sensor:electron-idle',
        'Electron Idle Sensor Poll',
        ELECTRON_IDLE_POLL_MS,
        () => sensorRegistryService.pollElectronIdle()
      );

      // AgentManifestService — 2-second manifest file change detection
      schedulerService.registerInterval(
        'agent-manifest:poll',
        'Agent Manifest Poll',
        WATCH_POLL_INTERVAL_MS,
        () => getAgentManifestService().tick()
      );
    })
    .catch((err) => {
      logger.error('Scheduler startup or automation sync failed:', err);
    });
}
