/**
 * Calendar Events Hook
 *
 * Fetches calendar events for a given month/year from the backend API.
 * Provides mutation functions for creating, updating, and deleting events.
 * Uses the apiFetch pattern consistent with the rest of the codebase.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiPost } from '@/lib/api-fetch';
import type { CalendarEvent, CalendarEventType, JobAction } from '@protolabs-ai/types';

interface CalendarListResponse {
  success: boolean;
  events: CalendarEvent[];
  error?: string;
}

interface CalendarMutationResponse {
  success: boolean;
  event?: CalendarEvent;
  error?: string;
}

interface CalendarDeleteResponse {
  success: boolean;
  error?: string;
}

/** Fields for creating a new custom calendar event */
export interface CreateEventInput {
  title: string;
  date: string;
  endDate?: string;
  description?: string;
  color?: string;
  type?: CalendarEventType;
  time?: string;
  jobAction?: JobAction;
}

/** Fields for updating an existing calendar event */
export interface UpdateEventInput {
  title?: string;
  date?: string;
  endDate?: string;
  description?: string;
  color?: string;
  time?: string;
}

interface UseCalendarEventsOptions {
  /** Project path to query events for */
  projectPath: string | null;
  /** Month (0-indexed, matching JS Date convention) */
  month: number;
  /** Full year (e.g. 2026) */
  year: number;
  /** Optional event type filter */
  types?: CalendarEventType[];
}

interface UseCalendarEventsResult {
  events: CalendarEvent[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refetch: () => void;
  createEvent: (input: CreateEventInput) => Promise<CalendarEvent | null>;
  updateEvent: (id: string, updates: UpdateEventInput) => Promise<CalendarEvent | null>;
  deleteEvent: (id: string) => Promise<boolean>;
  runJob: (id: string) => Promise<boolean>;
}

/**
 * Compute the start and end date strings for a given month range query.
 * Returns dates that span the full month plus surrounding days visible in
 * a 6-week calendar grid (previous month tail and next month head).
 */
function getMonthDateRange(month: number, year: number): { startDate: string; endDate: string } {
  // Start from the first day of the month, minus 6 days to cover previous month days in the grid
  const start = new Date(year, month, 1);
  start.setDate(start.getDate() - 6);

  // End at the last day of the month, plus 6 days to cover next month days in the grid
  const end = new Date(year, month + 1, 0);
  end.setDate(end.getDate() + 6);

  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  return { startDate, endDate };
}

/**
 * Fetch calendar events for a given month from the backend.
 * Provides CRUD mutation functions that automatically refetch after success.
 */
export function useCalendarEvents({
  projectPath,
  month,
  year,
  types,
}: UseCalendarEventsOptions): UseCalendarEventsResult {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchEvents = useCallback(async () => {
    if (!projectPath) {
      setEvents([]);
      setError(null);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = getMonthDateRange(month, year);

      const result = await apiPost<CalendarListResponse>('/api/calendar/list', {
        projectPath,
        startDate,
        endDate,
        types,
      });

      // Only apply result if this is still the latest request
      if (fetchId !== fetchIdRef.current) return;

      if (result.success) {
        setEvents(result.events);
      } else {
        setError(result.error ?? 'Failed to fetch calendar events');
        setEvents([]);
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar events');
      setEvents([]);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectPath, month, year, types]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = useCallback(
    async (input: CreateEventInput): Promise<CalendarEvent | null> => {
      if (!projectPath) return null;

      setIsMutating(true);
      try {
        const result = await apiPost<CalendarMutationResponse>('/api/calendar/create', {
          projectPath,
          title: input.title,
          date: input.date,
          endDate: input.endDate,
          type: input.type ?? 'custom',
          description: input.description,
          color: input.color,
          ...(input.time && { time: input.time }),
          ...(input.jobAction && { jobAction: input.jobAction }),
        });

        if (result.success && result.event) {
          await fetchEvents();
          return result.event;
        }
        throw new Error(result.error ?? 'Failed to create event');
      } finally {
        setIsMutating(false);
      }
    },
    [projectPath, fetchEvents]
  );

  const updateEvent = useCallback(
    async (id: string, updates: UpdateEventInput): Promise<CalendarEvent | null> => {
      if (!projectPath) return null;

      setIsMutating(true);
      try {
        const result = await apiPost<CalendarMutationResponse>('/api/calendar/update', {
          projectPath,
          id,
          ...updates,
        });

        if (result.success && result.event) {
          await fetchEvents();
          return result.event;
        }
        throw new Error(result.error ?? 'Failed to update event');
      } finally {
        setIsMutating(false);
      }
    },
    [projectPath, fetchEvents]
  );

  const deleteEvent = useCallback(
    async (id: string): Promise<boolean> => {
      if (!projectPath) return false;

      setIsMutating(true);
      try {
        const result = await apiPost<CalendarDeleteResponse>('/api/calendar/delete', {
          projectPath,
          id,
        });

        if (result.success) {
          await fetchEvents();
          return true;
        }
        throw new Error(result.error ?? 'Failed to delete event');
      } finally {
        setIsMutating(false);
      }
    },
    [projectPath, fetchEvents]
  );

  const runJob = useCallback(
    async (id: string): Promise<boolean> => {
      if (!projectPath) return false;

      setIsMutating(true);
      try {
        const result = await apiPost<{ success: boolean; error?: string }>(
          '/api/calendar/run-job',
          {
            projectPath,
            id,
          }
        );

        if (result.success) {
          await fetchEvents();
          return true;
        }
        throw new Error(result.error ?? 'Failed to run job');
      } finally {
        setIsMutating(false);
      }
    },
    [projectPath, fetchEvents]
  );

  return {
    events,
    isLoading,
    isMutating,
    error,
    refetch: fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    runJob,
  };
}
