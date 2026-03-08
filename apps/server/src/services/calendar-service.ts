/**
 * Calendar Service - Manages calendar events and aggregates from features and milestones
 *
 * Stores custom calendar events in .automaker/calendar.json and aggregates:
 * - Custom events from calendar.json
 * - Features with dueDate from FeatureLoader
 *
 * When a CRDTStore is registered via setCrdtStore(), all create/update/delete
 * operations are routed through the CRDT layer so events sync across all
 * hivemind instances. Falls back to filesystem when CRDT is not active.
 */

import path from 'path';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import { getAutomakerDir } from '@protolabsai/platform';
import * as secureFs from '../lib/secure-fs.js';
import type { FeatureLoader } from './feature-loader.js';
import type {
  Feature,
  CalendarEvent,
  CalendarEventType,
  CalendarQueryOptions,
} from '@protolabsai/types';
import type { CRDTStore, CalendarDocument } from '@protolabsai/crdt';

const logger = createLogger('CalendarService');

// Re-export shared types for consumers that import from this module
export type { CalendarEvent, CalendarEventType, CalendarQueryOptions };

/** Document id used for the shared global calendar in the CRDT store */
const CALENDAR_DOC_ID = 'shared';

/**
 * Singleton service for managing calendar events
 */
export class CalendarService {
  private static instance: CalendarService;
  private featureLoader: FeatureLoader | null = null;
  private crdtStore: CRDTStore | null = null;

  private constructor() {}

  static getInstance(): CalendarService {
    if (!CalendarService.instance) {
      CalendarService.instance = new CalendarService();
    }
    return CalendarService.instance;
  }

  /**
   * Set the FeatureLoader instance for aggregating feature due dates
   */
  setFeatureLoader(featureLoader: FeatureLoader): void {
    this.featureLoader = featureLoader;
  }

  /**
   * Register a CRDTStore instance for syncing calendar events across instances.
   * When set, all create/update/delete operations go through the CRDT layer.
   * Falls back to filesystem when not set.
   */
  setCrdtStore(store: CRDTStore): void {
    this.crdtStore = store;
    logger.info(
      '[CalendarService] CRDT store registered — calendar events will sync across instances'
    );
  }

  /**
   * Read all custom events — from CRDT if available, otherwise from filesystem.
   */
  private async readCustomEvents(projectPath: string): Promise<CalendarEvent[]> {
    if (this.crdtStore) {
      try {
        const handle = await this.crdtStore.getOrCreate<CalendarDocument>(
          'calendar',
          CALENDAR_DOC_ID,
          { events: {}, updatedAt: new Date().toISOString() }
        );
        const doc = handle.docSync();
        if (doc?.events) {
          return Object.values(doc.events);
        }
        return [];
      } catch (err) {
        logger.warn('[CalendarService] CRDT read failed, falling back to filesystem:', err);
      }
    }
    return this.readCalendarFile(projectPath);
  }

  /**
   * Write a single event — to CRDT if available, otherwise rebuild filesystem.
   */
  private async upsertEventToCrdt(event: CalendarEvent): Promise<void> {
    if (!this.crdtStore) return;
    await this.crdtStore.change<CalendarDocument>('calendar', CALENDAR_DOC_ID, (doc) => {
      if (!doc.events) {
        (doc as CalendarDocument).events = {};
      }
      doc.events[event.id] = event;
      doc.updatedAt = new Date().toISOString();
    });
  }

  /**
   * Delete a single event from CRDT by id.
   */
  private async deleteEventFromCrdt(id: string): Promise<void> {
    if (!this.crdtStore) return;
    await this.crdtStore.change<CalendarDocument>('calendar', CALENDAR_DOC_ID, (doc) => {
      if (doc.events) {
        delete doc.events[id];
      }
      doc.updatedAt = new Date().toISOString();
    });
  }

  /**
   * Get the path to the calendar.json file
   */
  private getCalendarPath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), 'calendar.json');
  }

  /**
   * Read calendar events from calendar.json
   */
  private async readCalendarFile(projectPath: string): Promise<CalendarEvent[]> {
    const calendarPath = this.getCalendarPath(projectPath);

    try {
      await secureFs.access(calendarPath);
    } catch {
      // File doesn't exist yet, return empty array
      return [];
    }

    const result = await readJsonWithRecovery<CalendarEvent[]>(calendarPath, [], {
      autoRestore: true,
    });

    return result.data || [];
  }

  /**
   * Write calendar events to calendar.json
   */
  private async writeCalendarFile(projectPath: string, events: CalendarEvent[]): Promise<void> {
    const calendarPath = this.getCalendarPath(projectPath);
    await atomicWriteJson(calendarPath, events, {
      backupCount: 3,
    });
  }

  /**
   * Convert a feature with dueDate to a calendar event
   */
  private featureToCalendarEvent(projectPath: string, feature: Feature): CalendarEvent | null {
    if (!feature.dueDate) {
      return null;
    }

    return {
      id: `feature-${feature.id}`,
      projectPath,
      title: feature.title || `Feature: ${feature.id}`,
      date: feature.dueDate,
      type: 'feature',
      description: feature.description?.substring(0, 200) || undefined,
      url: feature.branchName ? `/features/${feature.id}` : undefined,
      createdAt: feature.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Check if a date string is within a date range
   */
  private isDateInRange(dateStr: string, startDate?: string, endDate?: string): boolean {
    if (!startDate && !endDate) {
      return true;
    }

    const date = new Date(dateStr);

    if (startDate) {
      const start = new Date(startDate);
      if (date < start) {
        return false;
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (date > end) {
        return false;
      }
    }

    return true;
  }

  /**
   * List all calendar events (custom + aggregated from features and milestones)
   */
  async listEvents(projectPath: string, opts: CalendarQueryOptions = {}): Promise<CalendarEvent[]> {
    const { startDate, endDate, types } = opts;
    const allEvents: CalendarEvent[] = [];

    // 1. Read custom events — from CRDT when hivemind active, filesystem otherwise
    const customEvents = await this.readCustomEvents(projectPath);
    allEvents.push(...customEvents);

    // 2. Aggregate from FeatureLoader (features with dueDate)
    if (this.featureLoader && (!types || types.includes('feature'))) {
      try {
        const features = await this.featureLoader.getAll(projectPath);

        for (const feature of features) {
          const event = this.featureToCalendarEvent(projectPath, feature);
          if (event && this.isDateInRange(event.date, startDate, endDate)) {
            allEvents.push(event);
          }
        }
      } catch (error) {
        logger.warn('Failed to load features for calendar aggregation:', error);
      }
    }

    // Filter by date range
    let filteredEvents = allEvents;
    if (startDate || endDate) {
      filteredEvents = allEvents.filter((event) =>
        this.isDateInRange(event.date, startDate, endDate)
      );
    }

    // Filter by types if specified
    if (types && types.length > 0) {
      filteredEvents = filteredEvents.filter((event) => types.includes(event.type));
    }

    // Sort by date (earliest first)
    filteredEvents.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    return filteredEvents;
  }

  /**
   * Create a new calendar event
   */
  async createEvent(
    projectPath: string,
    data: Omit<CalendarEvent, 'id' | 'projectPath' | 'createdAt' | 'updatedAt'>
  ): Promise<CalendarEvent> {
    // Generate UUID-like ID
    const id = `event-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const now = new Date().toISOString();

    const event: CalendarEvent = {
      ...data,
      id,
      projectPath,
      createdAt: now,
      updatedAt: now,
    };

    if (this.crdtStore) {
      // Write through CRDT layer — syncs to all peers
      await this.upsertEventToCrdt(event);
    } else {
      // Filesystem fallback
      const events = await this.readCalendarFile(projectPath);
      events.push(event);
      await this.writeCalendarFile(projectPath, events);
    }

    logger.info(`Created calendar event ${id}`);
    return event;
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(
    projectPath: string,
    id: string,
    data: Partial<CalendarEvent>
  ): Promise<CalendarEvent> {
    if (this.crdtStore) {
      // Read from CRDT to find the existing event
      const existing = await this.readCustomEvents(projectPath);
      const existingEvent = existing.find((e) => e.id === id);
      if (!existingEvent) {
        throw new Error(`Calendar event ${id} not found`);
      }

      const updatedEvent: CalendarEvent = {
        ...existingEvent,
        ...data,
        id, // Ensure ID doesn't change
        createdAt: existingEvent.createdAt, // Preserve creation time
        updatedAt: new Date().toISOString(),
      };

      await this.upsertEventToCrdt(updatedEvent);
      logger.info(`Updated calendar event ${id}`);
      return updatedEvent;
    }

    // Filesystem fallback
    const events = await this.readCalendarFile(projectPath);

    // Find the event to update
    const index = events.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error(`Calendar event ${id} not found`);
    }

    // Update the event
    const updatedEvent: CalendarEvent = {
      ...events[index],
      ...data,
      id, // Ensure ID doesn't change
      createdAt: events[index].createdAt, // Preserve creation time
      updatedAt: new Date().toISOString(),
    };

    events[index] = updatedEvent;

    // Write back to file
    await this.writeCalendarFile(projectPath, events);

    logger.info(`Updated calendar event ${id}`);
    return updatedEvent;
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(projectPath: string, id: string): Promise<void> {
    if (this.crdtStore) {
      // Verify the event exists before deleting
      const existing = await this.readCustomEvents(projectPath);
      const exists = existing.some((e) => e.id === id);
      if (!exists) {
        throw new Error(`Calendar event ${id} not found`);
      }

      await this.deleteEventFromCrdt(id);
      logger.info(`Deleted calendar event ${id}`);
      return;
    }

    // Filesystem fallback
    const events = await this.readCalendarFile(projectPath);

    // Find the event to delete
    const index = events.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error(`Calendar event ${id} not found`);
    }

    // Remove the event
    events.splice(index, 1);

    // Write back to file
    await this.writeCalendarFile(projectPath, events);

    logger.info(`Deleted calendar event ${id}`);
  }

  /**
   * Upsert a calendar event by sourceId. If an event with the same sourceId exists,
   * update it; otherwise create a new one. Returns the upserted event and whether it was new.
   */
  async upsertBySourceId(
    projectPath: string,
    sourceId: string,
    data: Omit<CalendarEvent, 'id' | 'projectPath' | 'createdAt' | 'updatedAt'>
  ): Promise<{ event: CalendarEvent; created: boolean }> {
    const now = new Date().toISOString();

    if (this.crdtStore) {
      const existing = await this.readCustomEvents(projectPath);
      const existingIndex = existing.findIndex((e) => e.sourceId === sourceId);

      if (existingIndex !== -1) {
        const existingEvent = existing[existingIndex];
        const updated: CalendarEvent = {
          ...existingEvent,
          ...data,
          id: existingEvent.id,
          sourceId,
          createdAt: existingEvent.createdAt,
          updatedAt: now,
        };
        await this.upsertEventToCrdt(updated);
        return { event: updated, created: false };
      }

      const id = `event-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const newEvent: CalendarEvent = {
        ...data,
        id,
        projectPath,
        sourceId,
        createdAt: now,
        updatedAt: now,
      };
      await this.upsertEventToCrdt(newEvent);
      logger.info(`Created synced calendar event ${id} (sourceId: ${sourceId})`);
      return { event: newEvent, created: true };
    }

    // Filesystem fallback
    const events = await this.readCalendarFile(projectPath);
    const existingIndex = events.findIndex((e) => e.sourceId === sourceId);

    if (existingIndex !== -1) {
      // Update existing event
      const existing = events[existingIndex];
      const updated: CalendarEvent = {
        ...existing,
        ...data,
        id: existing.id,
        sourceId,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      events[existingIndex] = updated;
      await this.writeCalendarFile(projectPath, events);
      return { event: updated, created: false };
    }

    // Create new event
    const id = `google-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const newEvent: CalendarEvent = {
      ...data,
      id,
      projectPath,
      sourceId,
      createdAt: now,
      updatedAt: now,
    };
    events.push(newEvent);
    await this.writeCalendarFile(projectPath, events);
    logger.info(`Created synced calendar event ${id} (sourceId: ${sourceId})`);
    return { event: newEvent, created: true };
  }

  /**
   * Get pending job events that are due for execution.
   * Returns job events where date + time <= now and jobStatus is 'pending'.
   */
  async getDueJobs(projectPath: string, now: Date): Promise<CalendarEvent[]> {
    const events = await this.readCustomEvents(projectPath);
    const nowMs = now.getTime();

    return events.filter((event) => {
      if (event.type !== 'job' || event.jobStatus !== 'pending') return false;
      if (!event.time) return false;

      // Parse date + time into a timestamp
      const dueDate = new Date(`${event.date}T${event.time}:00`);
      return dueDate.getTime() <= nowMs;
    });
  }
}

// Export singleton instance
export const calendarService = CalendarService.getInstance();
