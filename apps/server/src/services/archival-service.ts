/**
 * ArchivalService - Automatic archival of completed features from the board.
 *
 * Runs on a 10-minute interval. For each done feature older than
 * the retention period (default 2 hours), ensures a ledger record exists,
 * then moves the feature directory to .automaker/archive/{featureId}/.
 *
 * Preserved in archive: feature.json (full), agent-output.md, handoff-*.json.
 * A minimal stub { id, archived, archivedAt, archivePath, status: "done", title }
 * is left at the original feature path so FeatureLoader.get() returns an archived
 * indicator rather than treating the feature as missing.
 *
 * Epic features are skipped if any child features are still active.
 */

import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { LedgerService } from './ledger-service.js';
import type { SettingsService } from './settings-service.js';
import type { EventEmitter } from '../lib/events.js';
import { ARCHIVAL_CHECK_INTERVAL_MS } from '../config/timeouts.js';

const logger = createLogger('ArchivalService');

const CHECK_INTERVAL_MS = ARCHIVAL_CHECK_INTERVAL_MS;
const DEFAULT_RETENTION_HOURS = 2;

export class ArchivalService {
  private featureLoader: FeatureLoader;
  private ledgerService: LedgerService;
  private settingsService: SettingsService;
  private events: EventEmitter;
  private timer: ReturnType<typeof setInterval> | null = null;
  private aborted = false;

  constructor(
    featureLoader: FeatureLoader,
    ledgerService: LedgerService,
    settingsService: SettingsService,
    events: EventEmitter
  ) {
    this.featureLoader = featureLoader;
    this.ledgerService = ledgerService;
    this.settingsService = settingsService;
    this.events = events;
  }

  /**
   * Start the archival check interval
   */
  start(): void {
    if (this.timer) return;
    this.aborted = false;

    this.timer = setInterval(() => {
      this.runArchivalCycle().catch((err) => {
        logger.error('Archival cycle failed:', err);
      });
    }, CHECK_INTERVAL_MS);

    logger.info('ArchivalService started (10min interval)');
  }

  /**
   * Stop the archival check interval
   */
  stop(): void {
    this.aborted = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('ArchivalService stopped');
  }

  /**
   * Run a single archival cycle across all known projects
   */
  async runArchivalCycle(): Promise<void> {
    const settings = await this.settingsService.getGlobalSettings();

    // Check if archival is enabled
    const archivalEnabled = settings.archival?.enabled ?? true;
    if (!archivalEnabled) return;

    const retentionHours = settings.archival?.retentionHours ?? DEFAULT_RETENTION_HOURS;
    const retentionMs = retentionHours * 60 * 60 * 1000;
    const now = Date.now();

    // Run archival for each known project
    const projects = settings.projects || [];
    let totalArchived = 0;

    for (const project of projects) {
      if (this.aborted) break;
      try {
        const archived = await this.archiveProjectFeatures(project.path, retentionMs, now);
        totalArchived += archived;
      } catch (err) {
        logger.error(`Archival failed for project ${project.path}:`, err);
      }
    }

    if (totalArchived > 0) {
      this.events.emit('archival:cycle-completed', { archivedCount: totalArchived });
      logger.info(`Archival cycle completed: ${totalArchived} features archived`);
    }
  }

  /**
   * Archive eligible features for a single project
   */
  private async archiveProjectFeatures(
    projectPath: string,
    retentionMs: number,
    now: number
  ): Promise<number> {
    const features = await this.featureLoader.getAll(projectPath);
    const completedFeatures = features.filter((f) => f.status === 'done');

    // Get active feature IDs for epic child check
    const activeStatuses = new Set(['backlog', 'in_progress', 'review', 'blocked']);
    const activeFeatureIds = new Set(
      features.filter((f) => activeStatuses.has(f.status as string)).map((f) => f.id)
    );

    let archivedCount = 0;

    for (const feature of completedFeatures) {
      if (this.aborted) break;

      // Check retention period — use completedAt, fall back to last status transition timestamp
      let completedAt = feature.completedAt ? new Date(feature.completedAt).getTime() : undefined;
      if (!completedAt) {
        // Fall back to the timestamp of the last status transition to done
        const lastDoneTransition = feature.statusHistory?.filter((t) => t.to === 'done').pop();
        if (lastDoneTransition?.timestamp) {
          completedAt = new Date(lastDoneTransition.timestamp).getTime();
        }
      }
      if (!completedAt || now - completedAt < retentionMs) continue;

      // Skip epics with active children
      if (feature.isEpic) {
        const hasActiveChildren = features.some(
          (f) => f.epicId === feature.id && activeFeatureIds.has(f.id)
        );
        if (hasActiveChildren) continue;
      }

      try {
        // Ensure ledger record exists (defensive write) before any destructive operation
        await this.ledgerService.recordFeatureCompletion(projectPath, feature);

        // Move feature to archive (preserves feature.json, agent-output.md, handoff-*.json)
        // and leaves a stub with status: "done" and title at the original path.
        const archivePath = await this.featureLoader.archiveFeature(projectPath, feature.id);

        this.events.emit('feature:archived', {
          projectPath,
          featureId: feature.id,
          featureTitle: feature.title,
          archivePath,
        });

        archivedCount++;
        logger.debug(`Archived feature "${feature.title || feature.id}" → ${archivePath}`);
      } catch (err) {
        logger.error(`Failed to archive feature ${feature.id}:`, err);
      }
    }

    return archivedCount;
  }

  /**
   * Manually trigger archival for a specific project (MCP tool)
   */
  async triggerArchival(projectPath: string): Promise<number> {
    const settings = await this.settingsService.getGlobalSettings();
    const retentionHours = settings.archival?.retentionHours ?? DEFAULT_RETENTION_HOURS;
    const retentionMs = retentionHours * 60 * 60 * 1000;
    return this.archiveProjectFeatures(projectPath, retentionMs, Date.now());
  }

  /**
   * Get archival status info
   */
  async getStatus(): Promise<{
    enabled: boolean;
    retentionHours: number;
    running: boolean;
  }> {
    const settings = await this.settingsService.getGlobalSettings();
    return {
      enabled: settings.archival?.enabled ?? true,
      retentionHours: settings.archival?.retentionHours ?? DEFAULT_RETENTION_HOURS,
      running: this.timer !== null,
    };
  }
}
