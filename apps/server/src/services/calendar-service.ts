/**
 * Calendar Service - Manages calendar events and aggregates from features and milestones
 *
 * Stores custom calendar events in .automaker/calendar.json and aggregates:
 * - Custom events from calendar.json
 * - Features with dueDate from FeatureLoader
 */

import path from 'path';
import { EventEmitter as NodeEventEmitter } from 'node:events';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import { getAutomakerDir } from '@protolabsai/platform';
import * as secureFs from '../lib/secure-fs.js';
import type { FeatureLoader } from './feature-loader.js';
import type {
  Feature,
  CalendarEvent,
  CalendarEventType,
  CalendarQueryOptions,
  RecurrenceRule,
} from '@protolabsai/types';
const logger = createLogger('CalendarService');

// Re-export shared types for consumers that import from this module
export type { CalendarEvent, CalendarEventType, CalendarQueryOptions };

/** Payload emitted with the 'calendar:reminder' event */
export interface CalendarReminderPayload {
  title: string;
  description: string;
  event: CalendarEvent;
}

/**
 * Singleton service for managing calendar events
 */
export class CalendarService {
  private static instance: CalendarService;
  private featureLoader: FeatureLoader | null = null;

  /** Internal Node.js EventEmitter for calendar:reminder events */
  private readonly reminderEmitter = new NodeEventEmitter();

  private constructor() {}

  /**
   * Subscribe to 'calendar:reminder' events.
   * The callback receives a CalendarReminderPayload with title, description, and the full event.
   */
  onReminder(callback: (payload: CalendarReminderPayload) => void): void {
    this.reminderEmitter.on('calendar:reminder', callback);
  }

  /**
   * Emit a 'calendar:reminder' event for a calendar event that is due.
   * Called by external code (e.g. JobExecutorService) when a job event fires.
   */
  emitReminder(payload: CalendarReminderPayload): void {
    this.reminderEmitter.emit('calendar:reminder', payload);
    logger.info(`[CalendarService] Emitted calendar:reminder for "${payload.title}"`);
  }

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
   * Read all custom events from the filesystem.
   */
  private async readCustomEvents(projectPath: string): Promise<CalendarEvent[]> {
    return this.readCalendarFile(projectPath);
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
   * Advance a date by the recurrence rule's frequency and interval.
   * Returns a new Date representing the next occurrence.
   */
  private advanceDateByFrequency(date: Date, rule: RecurrenceRule): Date {
    const interval = rule.interval ?? 1;
    const next = new Date(date);

    switch (rule.frequency) {
      case 'daily':
        next.setDate(next.getDate() + interval);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7 * interval);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + interval);
        break;
    }

    return next;
  }

  /**
   * Format a Date as YYYY-MM-DD string.
   */
  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Expand a recurring event into individual instances within a date range.
   * Each instance gets an ID of `parentId:YYYY-MM-DD` format.
   * Non-recurring events are returned as-is in a single-element array.
   */
  expandRecurringEvent(
    event: CalendarEvent,
    rangeStart: string,
    rangeEnd: string
  ): CalendarEvent[] {
    if (!event.recurrence) {
      return [event];
    }

    const rule = event.recurrence;
    const instances: CalendarEvent[] = [];
    const rangeStartDate = new Date(rangeStart);
    const rangeEndDate = new Date(rangeEnd);
    const ruleEndDate = rule.endDate ? new Date(rule.endDate) : null;
    const maxCount = rule.count ?? Infinity;

    // Safety cap to prevent runaway expansion
    const MAX_INSTANCES = 366;

    let current = new Date(event.date);
    let count = 0;

    while (count < maxCount && instances.length < MAX_INSTANCES) {
      // Stop if we've exceeded the recurrence end date
      if (ruleEndDate && current > ruleEndDate) break;

      // Stop if we've passed the query range end
      if (current > rangeEndDate) break;

      const dateStr = this.formatDate(current);

      // For weekly frequency with daysOfWeek, expand within the current week
      if (rule.frequency === 'weekly' && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        // Find the Monday of the current week (or Sunday, depending on perspective)
        const weekStart = new Date(current);
        const dayOfWeek = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - dayOfWeek); // Go to Sunday

        for (const dow of rule.daysOfWeek) {
          const dayDate = new Date(weekStart);
          dayDate.setDate(dayDate.getDate() + dow);

          // Must be on or after the original event start
          if (dayDate < new Date(event.date)) continue;
          if (ruleEndDate && dayDate > ruleEndDate) continue;
          if (dayDate > rangeEndDate) continue;
          if (count >= maxCount) break;

          count++;

          if (dayDate >= rangeStartDate) {
            const dayStr = this.formatDate(dayDate);
            instances.push({
              ...event,
              id: `${event.id}:${dayStr}`,
              date: dayStr,
            });
          }
        }
      } else {
        count++;

        if (current >= rangeStartDate) {
          instances.push({
            ...event,
            id: `${event.id}:${dateStr}`,
            date: dateStr,
          });
        }
      }

      current = this.advanceDateByFrequency(current, rule);
    }

    return instances;
  }

  /**
   * List all calendar events (custom + aggregated from features and milestones).
   * Recurring events are expanded into individual instances within the query range.
   */
  async listEvents(projectPath: string, opts: CalendarQueryOptions = {}): Promise<CalendarEvent[]> {
    const { startDate, endDate, types } = opts;
    const allEvents: CalendarEvent[] = [];

    // 1. Read custom events from filesystem
    const customEvents = await this.readCustomEvents(projectPath);

    // Expand recurring events if a date range is provided
    for (const event of customEvents) {
      if (event.recurrence && startDate && endDate) {
        allEvents.push(...this.expandRecurringEvent(event, startDate, endDate));
      } else {
        allEvents.push(event);
      }
    }

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

    const events = await this.readCalendarFile(projectPath);
    events.push(event);
    await this.writeCalendarFile(projectPath, events);

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
    const id = `event-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
