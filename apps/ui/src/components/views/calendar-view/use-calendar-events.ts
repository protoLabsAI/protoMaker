/**
 * Calendar Events Hook
 *
 * Fetches calendar events for a given month/year from the backend API.
 * Uses the apiFetch pattern consistent with the rest of the codebase.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiPost } from '@/lib/api-fetch';
import type { CalendarEvent, CalendarEventType } from '@protolabs-ai/types';

interface CalendarListResponse {
  success: boolean;
  events: CalendarEvent[];
  error?: string;
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
  error: string | null;
  refetch: () => void;
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
 */
export function useCalendarEvents({
  projectPath,
  month,
  year,
  types,
}: UseCalendarEventsOptions): UseCalendarEventsResult {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  return { events, isLoading, error, refetch: fetchEvents };
}
