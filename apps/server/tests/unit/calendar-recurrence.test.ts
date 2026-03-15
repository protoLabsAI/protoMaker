/**
 * Unit tests for calendar recurrence expansion and timezone support
 *
 * Tests the CalendarService.expandRecurringEvent() method and verifies
 * that recurring events produce correctly dated instances with parentId:date IDs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/platform', () => ({
  validatePath: vi.fn(),
  PathNotAllowedError: class PathNotAllowedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PathNotAllowedError';
    }
  },
  getAutomakerDir: vi.fn((p: string) => `${p}/.automaker`),
  secureFs: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    rm: vi.fn(),
    unlink: vi.fn(),
    copyFile: vi.fn(),
    appendFile: vi.fn(),
    rename: vi.fn(),
    lstat: vi.fn(),
    joinPath: vi.fn(),
    resolvePath: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    accessSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
    configureThrottling: vi.fn(),
    getThrottlingConfig: vi.fn(),
    getPendingOperations: vi.fn(),
    getActiveOperations: vi.fn(),
  },
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  atomicWriteJson: vi.fn(),
  readJsonWithRecovery: vi.fn(),
}));

// Must import after mocks are set up
import { CalendarService } from '@/services/calendar-service.js';
import type { CalendarEvent } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-123',
    projectPath: '/test/project',
    title: 'Test Event',
    date: '2026-03-01',
    type: 'custom',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarService.expandRecurringEvent', () => {
  let service: CalendarService;

  beforeEach(() => {
    service = CalendarService.getInstance();
  });

  describe('non-recurring events', () => {
    it('returns the original event unchanged when no recurrence is set', () => {
      const event = makeEvent();
      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-31');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(event);
    });
  });

  describe('daily recurrence', () => {
    it('expands daily events within a date range', () => {
      const event = makeEvent({
        recurrence: { frequency: 'daily' },
      });

      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-05');

      expect(result).toHaveLength(5);
      expect(result[0].date).toBe('2026-03-01');
      expect(result[1].date).toBe('2026-03-02');
      expect(result[2].date).toBe('2026-03-03');
      expect(result[3].date).toBe('2026-03-04');
      expect(result[4].date).toBe('2026-03-05');
    });

    it('respects interval for daily recurrence', () => {
      const event = makeEvent({
        recurrence: { frequency: 'daily', interval: 3 },
      });

      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-10');

      expect(result).toHaveLength(4);
      expect(result[0].date).toBe('2026-03-01');
      expect(result[1].date).toBe('2026-03-04');
      expect(result[2].date).toBe('2026-03-07');
      expect(result[3].date).toBe('2026-03-10');
    });

    it('stops at recurrence endDate', () => {
      const event = makeEvent({
        recurrence: { frequency: 'daily', endDate: '2026-03-03' },
      });

      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-31');

      expect(result).toHaveLength(3);
      expect(result[2].date).toBe('2026-03-03');
    });

    it('stops at count limit', () => {
      const event = makeEvent({
        recurrence: { frequency: 'daily', count: 3 },
      });

      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-31');

      expect(result).toHaveLength(3);
    });
  });

  describe('weekly recurrence', () => {
    it('expands weekly events', () => {
      const event = makeEvent({
        date: '2026-03-02', // Monday
        recurrence: { frequency: 'weekly' },
      });

      const result = service.expandRecurringEvent(event, '2026-03-02', '2026-03-23');

      expect(result).toHaveLength(4);
      expect(result[0].date).toBe('2026-03-02');
      expect(result[1].date).toBe('2026-03-09');
      expect(result[2].date).toBe('2026-03-16');
      expect(result[3].date).toBe('2026-03-23');
    });

    it('expands weekly events with specific days of week', () => {
      const event = makeEvent({
        date: '2026-03-02', // Monday
        recurrence: {
          frequency: 'weekly',
          daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
        },
      });

      const result = service.expandRecurringEvent(event, '2026-03-02', '2026-03-08');

      // Week of March 2: Mon 2, Wed 4, Fri 6
      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2026-03-02');
      expect(result[1].date).toBe('2026-03-04');
      expect(result[2].date).toBe('2026-03-06');
    });
  });

  describe('monthly recurrence', () => {
    it('expands monthly events', () => {
      const event = makeEvent({
        date: '2026-01-15',
        recurrence: { frequency: 'monthly' },
      });

      const result = service.expandRecurringEvent(event, '2026-01-01', '2026-04-30');

      expect(result).toHaveLength(4);
      expect(result[0].date).toBe('2026-01-15');
      expect(result[1].date).toBe('2026-02-15');
      expect(result[2].date).toBe('2026-03-15');
      expect(result[3].date).toBe('2026-04-15');
    });

    it('respects interval for monthly recurrence', () => {
      const event = makeEvent({
        date: '2026-01-15',
        recurrence: { frequency: 'monthly', interval: 2 },
      });

      const result = service.expandRecurringEvent(event, '2026-01-01', '2026-06-30');

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2026-01-15');
      expect(result[1].date).toBe('2026-03-15');
      expect(result[2].date).toBe('2026-05-15');
    });
  });

  describe('yearly recurrence', () => {
    it('expands yearly events', () => {
      const event = makeEvent({
        date: '2025-06-15',
        recurrence: { frequency: 'yearly' },
      });

      const result = service.expandRecurringEvent(event, '2025-01-01', '2027-12-31');

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2025-06-15');
      expect(result[1].date).toBe('2026-06-15');
      expect(result[2].date).toBe('2027-06-15');
    });
  });

  describe('instance ID format', () => {
    it('produces IDs in parentId:date format', () => {
      const event = makeEvent({
        id: 'parent-abc',
        recurrence: { frequency: 'daily', count: 2 },
      });

      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-10');

      expect(result[0].id).toBe('parent-abc:2026-03-01');
      expect(result[1].id).toBe('parent-abc:2026-03-02');
    });
  });

  describe('timezone field', () => {
    it('preserves timezone on expanded instances', () => {
      const event = makeEvent({
        timezone: 'America/New_York',
        recurrence: { frequency: 'daily', count: 2 },
      });

      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-10');

      expect(result[0].timezone).toBe('America/New_York');
      expect(result[1].timezone).toBe('America/New_York');
    });

    it('preserves timezone on non-recurring events', () => {
      const event = makeEvent({ timezone: 'Europe/London' });
      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-31');

      expect(result[0].timezone).toBe('Europe/London');
    });
  });

  describe('edge cases', () => {
    it('excludes instances before the query range start', () => {
      const event = makeEvent({
        date: '2026-03-01',
        recurrence: { frequency: 'daily' },
      });

      const result = service.expandRecurringEvent(event, '2026-03-05', '2026-03-07');

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2026-03-05');
    });

    it('handles empty range (start after event end)', () => {
      const event = makeEvent({
        date: '2026-03-01',
        recurrence: { frequency: 'daily', count: 3 },
      });

      const result = service.expandRecurringEvent(event, '2026-04-01', '2026-04-30');

      expect(result).toHaveLength(0);
    });

    it('preserves all original event fields on instances', () => {
      const event = makeEvent({
        description: 'A recurring meeting',
        color: '#FF5733',
        type: 'custom',
        recurrence: { frequency: 'daily', count: 1 },
      });

      const result = service.expandRecurringEvent(event, '2026-03-01', '2026-03-01');

      expect(result[0].description).toBe('A recurring meeting');
      expect(result[0].color).toBe('#FF5733');
      expect(result[0].type).toBe('custom');
      expect(result[0].recurrence).toEqual({ frequency: 'daily', count: 1 });
    });
  });
});
