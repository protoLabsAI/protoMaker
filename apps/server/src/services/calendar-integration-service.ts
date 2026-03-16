/**
 * CalendarIntegrationService — translates operational events into calendar entries.
 *
 * Subscribes to feature lifecycle events (started, completed, pr-merged) and
 * auto-mode events (started, stopped) and creates 'ops'-type calendar entries
 * so project operators can see operational activity in the calendar view.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { CalendarService } from './calendar-service.js';

const logger = createLogger('CalendarIntegrationService');

interface FeatureEventPayload {
  projectPath: string;
  featureId?: string;
  featureTitle?: string;
  title?: string;
}

interface AutoModeEventPayload {
  projectPath: string;
}

export class CalendarIntegrationService {
  private calendarService: CalendarService | null = null;
  private unsubscribe: (() => void) | null = null;

  initialize(events: EventEmitter, calendarService: CalendarService): void {
    this.calendarService = calendarService;

    this.unsubscribe = events.subscribe((type, payload) => {
      const p = payload as Record<string, unknown>;
      const projectPath = p['projectPath'] as string | undefined;
      if (!projectPath) return;

      if (type === 'feature:started') {
        this.handleFeatureStarted(payload as FeatureEventPayload).catch((err) =>
          logger.warn('CalendarIntegration feature:started error:', err)
        );
      } else if (type === 'feature:completed') {
        this.handleFeatureCompleted(payload as FeatureEventPayload).catch((err) =>
          logger.warn('CalendarIntegration feature:completed error:', err)
        );
      } else if (type === 'feature:pr-merged') {
        this.handleFeaturePrMerged(payload as FeatureEventPayload).catch((err) =>
          logger.warn('CalendarIntegration feature:pr-merged error:', err)
        );
      } else if (type === 'auto-mode:started') {
        this.handleAutoModeStarted(payload as AutoModeEventPayload).catch((err) =>
          logger.warn('CalendarIntegration auto-mode:started error:', err)
        );
      } else if (type === 'auto-mode:stopped') {
        this.handleAutoModeStopped(payload as AutoModeEventPayload).catch((err) =>
          logger.warn('CalendarIntegration auto-mode:stopped error:', err)
        );
      }
    });

    logger.info('CalendarIntegrationService initialized');
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.calendarService = null;
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private featureLabel(payload: FeatureEventPayload): string {
    return payload.featureTitle ?? payload.title ?? payload.featureId ?? 'Unknown feature';
  }

  private async handleFeatureStarted(payload: FeatureEventPayload): Promise<void> {
    if (!this.calendarService || !payload.projectPath) return;
    const label = this.featureLabel(payload);
    const sourceId = `ops:feature:started:${payload.featureId ?? label}`;
    await this.calendarService
      .upsertBySourceId(payload.projectPath, sourceId, {
        title: `Started: ${label}`,
        date: this.todayString(),
        type: 'ops',
        description: `Feature implementation started`,
      })
      .catch((err) => logger.warn(`Failed to create ops event for feature:started: ${err}`));
  }

  private async handleFeatureCompleted(payload: FeatureEventPayload): Promise<void> {
    if (!this.calendarService || !payload.projectPath) return;
    const label = this.featureLabel(payload);
    const sourceId = `ops:feature:completed:${payload.featureId ?? label}`;
    await this.calendarService
      .upsertBySourceId(payload.projectPath, sourceId, {
        title: `Completed: ${label}`,
        date: this.todayString(),
        type: 'ops',
        description: `Feature implementation completed`,
      })
      .catch((err) => logger.warn(`Failed to create ops event for feature:completed: ${err}`));
  }

  private async handleFeaturePrMerged(payload: FeatureEventPayload): Promise<void> {
    if (!this.calendarService || !payload.projectPath) return;
    const label = this.featureLabel(payload);
    const sourceId = `ops:feature:pr-merged:${payload.featureId ?? label}`;
    await this.calendarService
      .upsertBySourceId(payload.projectPath, sourceId, {
        title: `Merged: ${label}`,
        date: this.todayString(),
        type: 'ops',
        description: `Feature PR merged`,
      })
      .catch((err) => logger.warn(`Failed to create ops event for feature:pr-merged: ${err}`));
  }

  private async handleAutoModeStarted(payload: AutoModeEventPayload): Promise<void> {
    if (!this.calendarService || !payload.projectPath) return;
    const sourceId = `ops:auto-mode:started:${this.todayString()}`;
    await this.calendarService
      .upsertBySourceId(payload.projectPath, sourceId, {
        title: 'Auto-mode started',
        date: this.todayString(),
        type: 'ops',
        description: 'Autonomous feature processing started',
      })
      .catch((err) => logger.warn(`Failed to create ops event for auto-mode:started: ${err}`));
  }

  private async handleAutoModeStopped(payload: AutoModeEventPayload): Promise<void> {
    if (!this.calendarService || !payload.projectPath) return;
    const sourceId = `ops:auto-mode:stopped:${this.todayString()}`;
    await this.calendarService
      .upsertBySourceId(payload.projectPath, sourceId, {
        title: 'Auto-mode stopped',
        date: this.todayString(),
        type: 'ops',
        description: 'Autonomous feature processing stopped',
      })
      .catch((err) => logger.warn(`Failed to create ops event for auto-mode:stopped: ${err}`));
  }
}

export const calendarIntegrationService = new CalendarIntegrationService();
