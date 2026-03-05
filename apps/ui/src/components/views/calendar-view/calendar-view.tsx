/**
 * Calendar View
 *
 * Google Calendar-style month grid with event titles visible in each day cell.
 * Supports creating, editing, and deleting custom events.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { useCalendarEvents } from './use-calendar-events';
import { CreateEventDialog } from './create-event-dialog';
import { EventDetailPanel } from './event-detail-panel';
import { SkeletonPulse, Spinner } from '@protolabsai/ui/atoms';
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { PanelHeader } from '@/components/shared/panel-header';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiPost } from '@/lib/api-fetch';
import type { CalendarEvent, CalendarEventType } from '@protolabsai/types';
import type { CreateEventInput, UpdateEventInput } from './use-calendar-events';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of event rows shown per day cell before showing "+N more" */
const MAX_EVENTS_PER_DAY = 3;

/** Weekday labels for the header row */
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Color mapping for event types (used when event has no custom color) */
const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  feature: 'bg-chart-1',
  milestone: 'bg-chart-2',
  custom: 'bg-chart-3',
  google: 'bg-chart-4',
  job: 'bg-amber-500',
};

/** Status badge colors for job events */
const JOB_STATUS_COLORS = {
  pending: 'bg-muted-foreground/40 text-muted-foreground',
  running: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  completed: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/20 text-destructive',
} as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Group events by their date string (YYYY-MM-DD).
 * Multi-day events are included in each day they span.
 */
function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const startDate = new Date(event.date + 'T00:00:00');
    const endDate = event.endDate ? new Date(event.endDate + 'T00:00:00') : startDate;

    const current = new Date(startDate);
    while (current <= endDate) {
      const key = toDateKey(current);
      const existing = map.get(key);
      if (existing) {
        existing.push(event);
      } else {
        map.set(key, [event]);
      }
      current.setDate(current.getDate() + 1);
    }
  }

  return map;
}

/** Get the Tailwind background class for an event dot */
function getEventDotClass(event: CalendarEvent): string {
  if (event.color) {
    return ''; // Custom color handled via inline style
  }
  return EVENT_TYPE_COLORS[event.type] ?? 'bg-muted-foreground';
}

/** Get inline style for custom-colored event dot */
function getEventDotStyle(event: CalendarEvent): React.CSSProperties | undefined {
  if (event.color) {
    return { backgroundColor: event.color };
  }
  return undefined;
}

/** Format a Date to a local YYYY-MM-DD key (avoids UTC shift) */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get today's date key */
function getTodayKey(): string {
  return toDateKey(new Date());
}

/**
 * Build the 42-cell (6 weeks) grid for a given month.
 * Returns an array of Date objects starting from the Sunday of the first week.
 */
function buildMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return cells;
}

/** Format month/year for the header */
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ============================================================================
// Sub-components
// ============================================================================

interface EventRowProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}

function EventRow({ event, onClick }: EventRowProps) {
  const isJob = event.type === 'job';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      className="flex items-center gap-1 w-full rounded px-1 py-0.5 text-left hover:bg-accent/60 transition-colors cursor-pointer group"
    >
      <span
        className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', getEventDotClass(event))}
        style={getEventDotStyle(event)}
      />
      {isJob && event.time && (
        <span className="text-[10px] text-muted-foreground shrink-0">{event.time}</span>
      )}
      <span className="text-[11px] leading-tight truncate">{event.title}</span>
      {isJob && event.jobStatus && (
        <span
          className={cn(
            'ml-auto text-[9px] px-1 py-px rounded-full shrink-0 font-medium',
            JOB_STATUS_COLORS[event.jobStatus]
          )}
        >
          {event.jobStatus}
        </span>
      )}
    </button>
  );
}

interface DayCellProps {
  date: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  isToday: boolean;
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
}

function DayCell({
  date,
  events,
  isCurrentMonth,
  isToday,
  onEventClick,
  onDayClick,
}: DayCellProps) {
  const visibleEvents = events.slice(0, MAX_EVENTS_PER_DAY);
  const overflowCount = events.length - MAX_EVENTS_PER_DAY;

  return (
    <div
      onClick={() => onDayClick(date)}
      className={cn(
        'min-h-[5.5rem] border-t border-r p-1 cursor-pointer transition-colors hover:bg-accent/30',
        !isCurrentMonth && 'bg-secondary/50'
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            'text-xs leading-5 w-6 h-6 flex items-center justify-center rounded-full',
            isToday && 'bg-primary text-primary-foreground font-semibold',
            !isToday && isCurrentMonth && 'text-foreground',
            !isCurrentMonth && 'text-muted-foreground/50'
          )}
        >
          {date.getDate()}
        </span>
      </div>
      {visibleEvents.length > 0 && (
        <div className="mt-0.5 space-y-px">
          {visibleEvents.map((event) => (
            <EventRow key={event.id} event={event} onClick={onEventClick} />
          ))}
          {overflowCount > 0 && (
            <span className="text-[10px] text-muted-foreground px-1">+{overflowCount} more</span>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Weekday header skeleton */}
      <div className="grid grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`wk-${i}`} className="border-t border-r p-2">
            <SkeletonPulse className="h-3 w-8 ml-auto" />
          </div>
        ))}
      </div>
      {/* Day grid skeleton */}
      {Array.from({ length: 6 }).map((_, row) => (
        <div key={`row-${row}`} className="grid grid-cols-7 flex-1">
          {Array.from({ length: 7 }).map((_, col) => (
            <div key={`day-${row}-${col}`} className="border-t border-r p-1">
              <SkeletonPulse className="h-4 w-4 rounded-full mb-1" />
              <SkeletonPulse className="h-3 w-full mb-0.5" />
              <SkeletonPulse className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Google Calendar Nudge
// ============================================================================

const GCAL_NUDGE_DISMISSED_KEY = 'automaker:gcal-nudge-dismissed';

interface GoogleCalendarNudgeProps {
  projectPath: string;
}

function GoogleCalendarNudge({ projectPath }: GoogleCalendarNudgeProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(GCAL_NUDGE_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (dismissed) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await apiPost<{ connected: boolean }>('/api/google-calendar/status', {
          projectPath,
        });
        if (!cancelled) setConnected(data.connected);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(GCAL_NUDGE_DISMISSED_KEY, 'true');
    } catch {
      // localStorage not available
    }
  };

  // Don't show if dismissed, still loading, or already connected
  if (dismissed || connected === null || connected) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent/50 border border-border/50 text-xs text-muted-foreground">
      <Calendar className="h-3.5 w-3.5 shrink-0" />
      <span>
        Connect Google Calendar in{' '}
        <span className="font-medium text-foreground">Project Settings</span> to see your events
        here.
      </span>
      <button
        onClick={handleDismiss}
        className="ml-auto p-0.5 rounded hover:bg-accent transition-colors shrink-0"
        aria-label="Dismiss Google Calendar nudge"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CalendarView() {
  const { currentProject } = useAppStore();
  const projectPath = currentProject?.path ?? null;

  const now = new Date();
  const [displayMonth, setDisplayMonth] = useState<Date>(
    new Date(now.getFullYear(), now.getMonth())
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<string | undefined>(undefined);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  const { events, isLoading, isMutating, error, createEvent, updateEvent, deleteEvent, runJob } =
    useCalendarEvents({
      projectPath,
      month: displayMonth.getMonth(),
      year: displayMonth.getFullYear(),
    });

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const todayKey = useMemo(() => getTodayKey(), []);
  const gridCells = useMemo(
    () => buildMonthGrid(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth]
  );

  const handlePrevMonth = useCallback(() => {
    setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1));
  }, []);

  const handleToday = useCallback(() => {
    const today = new Date();
    setDisplayMonth(new Date(today.getFullYear(), today.getMonth()));
  }, []);

  const handleNewEvent = useCallback(() => {
    const today = new Date();
    setCreateDefaultDate(toDateKey(today));
    setShowCreateDialog(true);
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setDetailEvent(event);
    setShowDetailPanel(true);
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    const key = toDateKey(date);
    setCreateDefaultDate(key);
    setShowCreateDialog(true);
  }, []);

  const handleCreateEvent = useCallback(
    async (input: CreateEventInput) => {
      try {
        await createEvent(input);
        setShowCreateDialog(false);
        toast.success('Event created');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create event');
      }
    },
    [createEvent]
  );

  const handleUpdateEvent = useCallback(
    async (id: string, updates: UpdateEventInput) => {
      try {
        await updateEvent(id, updates);
        toast.success('Event updated');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update event');
      }
    },
    [updateEvent]
  );

  const handleDeleteEvent = useCallback(
    async (id: string) => {
      try {
        await deleteEvent(id);
        setShowDetailPanel(false);
        setDetailEvent(null);
        toast.success('Event deleted');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete event');
      }
    },
    [deleteEvent]
  );

  const handleRunJob = useCallback(
    async (id: string) => {
      try {
        await runJob(id);
        toast.success('Job execution started');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to run job');
      }
    },
    [runJob]
  );

  // No project selected state
  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground">Select a project to view calendar</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader
        icon={Calendar}
        title="Calendar"
        badge={
          events.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          ) : undefined
        }
        actions={[
          { icon: Plus, label: 'New event', onClick: handleNewEvent, testId: 'new-event-button' },
          { icon: CalendarDays, label: 'Today', onClick: handleToday },
          { icon: ChevronLeft, label: 'Previous month', onClick: handlePrevMonth },
          { icon: ChevronRight, label: 'Next month', onClick: handleNextMonth },
        ]}
      />

      {/* Google Calendar nudge */}
      <div className="px-6 pt-2">
        <GoogleCalendarNudge projectPath={projectPath} />
      </div>

      {/* Month/Year title */}
      <div className="px-6 py-3">
        <h2 className="text-base font-semibold">{formatMonthYear(displayMonth)}</h2>
      </div>

      {/* Calendar body */}
      <div className="flex-1 flex flex-col overflow-hidden px-6 pb-4">
        {isLoading && events.length === 0 ? (
          <CalendarSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1">
            <Calendar className="h-10 w-10 text-destructive/30 mb-3" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 relative border-l border-b">
            {/* Loading indicator for subsequent fetches */}
            {isLoading && events.length > 0 && (
              <div className="absolute top-2 right-2 z-10">
                <Spinner className="h-4 w-4" />
              </div>
            )}

            {/* Weekday header */}
            <div className="grid grid-cols-7">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="border-t border-r py-1.5 px-2 text-right text-xs font-medium text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Day grid - 6 rows of 7 cells */}
            <div className="grid grid-cols-7 grid-rows-6 flex-1">
              {gridCells.map((date, i) => {
                const dateKey = toDateKey(date);
                const dayEvents = eventsByDate.get(dateKey) ?? [];
                const isCurrentMonth = date.getMonth() === displayMonth.getMonth();
                const isToday = dateKey === todayKey;

                return (
                  <DayCell
                    key={i}
                    date={date}
                    events={dayEvents}
                    isCurrentMonth={isCurrentMonth}
                    isToday={isToday}
                    onEventClick={handleEventClick}
                    onDayClick={handleDayClick}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create event dialog */}
      <CreateEventDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateEvent}
        defaultDate={createDefaultDate}
        isMutating={isMutating}
      />

      {/* Event detail/edit panel */}
      <EventDetailPanel
        event={detailEvent}
        open={showDetailPanel}
        onOpenChange={setShowDetailPanel}
        onUpdate={handleUpdateEvent}
        onDelete={handleDeleteEvent}
        onRunJob={handleRunJob}
        isMutating={isMutating}
      />
    </div>
  );
}
