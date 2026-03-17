import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';
import { getPRWatcherService } from './pr-watcher-service.js';

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
    integrityWatchdogService,
    featureLoader,
    healthMonitorService,
    specGenerationMonitor,
    leadEngineerService,
    prFeedbackService,
    archivalService,
  } = container;

  // Wire schedulerService into interval-tracked services so their timers
  // appear in schedulerService.listAll() and can be inspected centrally.
  healthMonitorService.setSchedulerService(schedulerService);
  specGenerationMonitor.setSchedulerService(schedulerService);
  leadEngineerService.setSchedulerService(schedulerService);
  const prWatcher = getPRWatcherService();
  if (prWatcher) {
    prWatcher.setSchedulerService(schedulerService);
  }
  prFeedbackService.setSchedulerService(schedulerService);
  archivalService.setSchedulerService(schedulerService);

  // Scheduler Service initialization and task registration via AutomationService
  schedulerService.initialize(events, dataDir);
  schedulerService.setSettingsService(settingsService);
  void schedulerService
    .start()
    .then(async () => {
      await automationService.syncWithScheduler({
        events,
        autoModeService,
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
    })
    .catch((err) => {
      logger.error('Scheduler startup or automation sync failed:', err);
    });
}
