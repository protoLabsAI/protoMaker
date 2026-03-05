import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarService } from '@/services/calendar-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import * as secureFs from '@/lib/secure-fs.js';
import { atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import type { Feature, CalendarEvent } from '@protolabsai/types';

// Mock modules
vi.mock('@/lib/secure-fs.js');
vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    atomicWriteJson: vi.fn(),
    readJsonWithRecovery: vi.fn(),
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

describe('calendar-service.ts', () => {
  let service: CalendarService;
  let mockFeatureLoader: FeatureLoader;
  const projectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    // Get fresh singleton instance
    service = CalendarService.getInstance();

    // Mock FeatureLoader
    mockFeatureLoader = {
      getAll: vi.fn().mockResolvedValue([]),
    } as unknown as FeatureLoader;

    service.setFeatureLoader(mockFeatureLoader);

    // Mock file system - by default, calendar.json doesn't exist
    vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(readJsonWithRecovery).mockResolvedValue({
      data: [],
      recovered: false,
      source: 'default',
    });
    vi.mocked(atomicWriteJson).mockResolvedValue(undefined);
  });

  describe('listEvents', () => {
    it('should merge features and custom events correctly', async () => {
      // Setup custom events
      const customEvents: CalendarEvent[] = [
        {
          id: 'custom-1',
          title: 'Custom Event',
          date: '2026-03-01',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: customEvents,
        recovered: false,
        source: 'main',
      });

      // Setup features with due dates
      const features: Feature[] = [
        {
          id: 'feature-1',
          title: 'Feature 1',
          dueDate: '2026-03-05',
          description: 'Test feature',
          createdAt: '2026-02-24T00:00:00Z',
        } as Feature,
        {
          id: 'feature-2',
          title: 'Feature 2',
          // No due date - should be excluded
          createdAt: '2026-02-24T00:00:00Z',
        } as Feature,
      ];
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(features);

      const events = await service.listEvents(projectPath);

      // Should have 2 events total: 1 custom + 1 feature
      expect(events).toHaveLength(2);

      // Check custom event
      expect(events.find((e) => e.id === 'custom-1')).toBeDefined();

      // Check feature event
      const featureEvent = events.find((e) => e.id === 'feature-feature-1');
      expect(featureEvent).toBeDefined();
      expect(featureEvent?.type).toBe('feature');
      expect(featureEvent?.date).toBe('2026-03-05');

      // Events should be sorted by date (earliest first)
      expect(events[0].date).toBe('2026-03-01');
      expect(events[1].date).toBe('2026-03-05');
    });

    it('should filter events by date range', async () => {
      const customEvents: CalendarEvent[] = [
        {
          id: 'event-1',
          title: 'Event 1',
          date: '2026-03-01',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
        {
          id: 'event-2',
          title: 'Event 2',
          date: '2026-03-15',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: customEvents,
        recovered: false,
        source: 'main',
      });

      const events = await service.listEvents(projectPath, {
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      });

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('event-1');
    });

    it('should filter events by type', async () => {
      const customEvents: CalendarEvent[] = [
        {
          id: 'event-1',
          title: 'Event 1',
          date: '2026-03-01',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: customEvents,
        recovered: false,
        source: 'main',
      });

      const features: Feature[] = [
        {
          id: 'feature-1',
          title: 'Feature 1',
          dueDate: '2026-03-05',
          createdAt: '2026-02-24T00:00:00Z',
        } as Feature,
      ];
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(features);

      // Only request feature events
      const events = await service.listEvents(projectPath, {
        types: ['feature'],
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('feature');
    });

    it('should handle empty calendar file', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: [],
        recovered: false,
        source: 'default',
      });

      const events = await service.listEvents(projectPath);

      expect(events).toEqual([]);
    });

    it('should handle FeatureLoader errors gracefully', async () => {
      vi.mocked(mockFeatureLoader.getAll).mockRejectedValue(new Error('Feature loader error'));

      // Should not throw, just log warning
      const events = await service.listEvents(projectPath);

      expect(events).toEqual([]);
    });
  });

  describe('createEvent', () => {
    it('should persist event to correct path', async () => {
      const existingEvents: CalendarEvent[] = [];
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: existingEvents,
        recovered: false,
        source: 'main',
      });

      const newEventData = {
        title: 'New Event',
        date: '2026-03-15',
        type: 'custom' as const,
        description: 'Test event',
      };

      const event = await service.createEvent(projectPath, newEventData);

      expect(event.id).toBeDefined();
      expect(event.title).toBe('New Event');
      expect(event.date).toBe('2026-03-15');
      expect(event.createdAt).toBeDefined();
      expect(event.updatedAt).toBeDefined();

      // Verify atomicWriteJson was called with correct path
      expect(atomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('calendar.json'),
        expect.arrayContaining([
          expect.objectContaining({
            title: 'New Event',
            date: '2026-03-15',
          }),
        ]),
        expect.any(Object)
      );
    });

    it('should append to existing events', async () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'existing-1',
          title: 'Existing Event',
          date: '2026-03-01',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: existingEvents,
        recovered: false,
        source: 'main',
      });

      await service.createEvent(projectPath, {
        title: 'New Event',
        date: '2026-03-15',
        type: 'custom',
        projectPath,
      });

      // Should write both events
      expect(atomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ id: 'existing-1' }),
          expect.objectContaining({ title: 'New Event' }),
        ]),
        expect.any(Object)
      );
    });
  });

  describe('upsertBySourceId', () => {
    it('should create new event if sourceId does not exist', async () => {
      const existingEvents: CalendarEvent[] = [];
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: existingEvents,
        recovered: false,
        source: 'main',
      });

      const result = await service.upsertBySourceId(projectPath, 'google-123', {
        title: 'Google Event',
        date: '2026-03-15',
        type: 'google',
        projectPath,
      });

      expect(result.created).toBe(true);
      expect(result.event.sourceId).toBe('google-123');
      expect(result.event.title).toBe('Google Event');
      expect(result.event.id).toBeDefined();
    });

    it('should update existing event if sourceId matches (deduplication)', async () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'google-existing',
          title: 'Old Title',
          date: '2026-03-01',
          type: 'google',
          projectPath,
          sourceId: 'google-123',
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: existingEvents,
        recovered: false,
        source: 'main',
      });

      const result = await service.upsertBySourceId(projectPath, 'google-123', {
        title: 'Updated Title',
        date: '2026-03-15',
        type: 'google',
        projectPath,
      });

      expect(result.created).toBe(false);
      expect(result.event.id).toBe('google-existing'); // ID preserved
      expect(result.event.title).toBe('Updated Title'); // Title updated
      expect(result.event.date).toBe('2026-03-15'); // Date updated
      expect(result.event.createdAt).toBe('2026-02-24T00:00:00Z'); // createdAt preserved
      expect(result.event.updatedAt).not.toBe('2026-02-24T00:00:00Z'); // updatedAt changed
    });

    it('should preserve createdAt when updating', async () => {
      const originalCreatedAt = '2026-01-01T00:00:00Z';
      const existingEvents: CalendarEvent[] = [
        {
          id: 'google-existing',
          title: 'Old Title',
          date: '2026-03-01',
          type: 'google',
          projectPath,
          sourceId: 'google-123',
          createdAt: originalCreatedAt,
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: existingEvents,
        recovered: false,
        source: 'main',
      });

      const result = await service.upsertBySourceId(projectPath, 'google-123', {
        title: 'Updated Title',
        date: '2026-03-15',
        type: 'google',
        projectPath,
      });

      expect(result.event.createdAt).toBe(originalCreatedAt);
    });
  });

  describe('updateEvent', () => {
    it('should update existing event', async () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'event-1',
          title: 'Original Title',
          date: '2026-03-01',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: existingEvents,
        recovered: false,
        source: 'main',
      });

      const updated = await service.updateEvent(projectPath, 'event-1', {
        title: 'Updated Title',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.date).toBe('2026-03-01'); // Unchanged
      expect(updated.createdAt).toBe('2026-02-24T00:00:00Z'); // Preserved
    });

    it('should throw error if event not found', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: [],
        recovered: false,
        source: 'default',
      });

      await expect(
        service.updateEvent(projectPath, 'nonexistent', { title: 'New Title' })
      ).rejects.toThrow('Calendar event nonexistent not found');
    });
  });

  describe('deleteEvent', () => {
    it('should delete event', async () => {
      const existingEvents: CalendarEvent[] = [
        {
          id: 'event-1',
          title: 'Event 1',
          date: '2026-03-01',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
        {
          id: 'event-2',
          title: 'Event 2',
          date: '2026-03-15',
          type: 'custom',
          projectPath,
          createdAt: '2026-02-24T00:00:00Z',
          updatedAt: '2026-02-24T00:00:00Z',
        },
      ];
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: existingEvents,
        recovered: false,
        source: 'main',
      });

      await service.deleteEvent(projectPath, 'event-1');

      // Should write only event-2
      expect(atomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.objectContaining({ id: 'event-2' })]),
        expect.any(Object)
      );

      const writtenEvents = vi.mocked(atomicWriteJson).mock.calls[0][1] as CalendarEvent[];
      expect(writtenEvents).toHaveLength(1);
      expect(writtenEvents[0].id).toBe('event-2');
    });

    it('should throw error if event not found', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: [],
        recovered: false,
        source: 'default',
      });

      await expect(service.deleteEvent(projectPath, 'nonexistent')).rejects.toThrow(
        'Calendar event nonexistent not found'
      );
    });
  });
});
