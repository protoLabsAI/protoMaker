/**
 * Calendar View
 *
 * Monthly calendar grid with event dots using react-day-picker.
 * Shows colored dots for events on each day, with a popover for event details.
 * Supports creating, editing, and deleting custom events.
 */

import { useState, useMemo, useCallback } from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import 'react-day-picker/style.css';
import { useAppStore } from '@/store/app-store';
import { useCalendarEvents } from './use-calendar-events';
import { CreateEventDialog } from './create-event-dialog';
import { EventDetailPanel } from './event-detail-panel';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs-ai/ui/atoms';
import { SkeletonPulse, Spinner } from '@protolabs-ai/ui/atoms';
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CalendarEvent, CalendarEventType } from '@protolabs-ai/types';
import type { CreateEventInput, UpdateEventInput } from './use-calendar-events';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of event dots shown per day cell before showing "+N" */
const MAX_DOTS_PER_DAY = 3;

/** Color mapping for event types (used when event has no custom color) */
const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  feature: 'bg-blue-500',
  milestone: 'bg-violet-500',
  custom: 'bg-emerald-500',
  google: 'bg-red-500',
  linear: 'bg-indigo-500',
};

/** Human-readable labels for event types */
const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  feature: 'Feature',
  milestone: 'Milestone',
  custom: 'Custom',
  google: 'Google Calendar',
  linear: 'Linear',
};

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
      const key = current.toISOString().split('T')[0];
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

/** Format a date string (YYYY-MM-DD) to a human-readable label */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Get the Tailwind background class for an event */
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

// ============================================================================
// Sub-components
// ============================================================================

interface EventDotProps {
  event: CalendarEvent;
}

function EventDot({ event }: EventDotProps) {
  return (
    <span
      className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', getEventDotClass(event))}
      style={getEventDotStyle(event)}
      title={event.title}
    />
  );
}

interface DayEventsPopoverContentProps {
  dateStr: string;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

function DayEventsPopoverContent({ dateStr, events, onEventClick }: DayEventsPopoverContentProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground mb-2">{formatDateLabel(dateStr)}</p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onEventClick(event)}
            className="flex items-start gap-2 rounded-md p-1.5 hover:bg-accent/50 w-full text-left transition-colors cursor-pointer"
          >
            <span
              className={cn(
                'mt-1 inline-block h-2 w-2 rounded-full shrink-0',
                getEventDotClass(event)
              )}
              style={getEventDotStyle(event)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium truncate">{event.title}</p>
                {event.url && (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {EVENT_TYPE_LABELS[event.type] ?? event.type}
                </span>
                {event.endDate && event.endDate !== event.date && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {event.date} - {event.endDate}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {/* Month header skeleton */}
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-6 w-32" />
        <div className="flex gap-2">
          <SkeletonPulse className="h-8 w-8 rounded-md" />
          <SkeletonPulse className="h-8 w-8 rounded-md" />
        </div>
      </div>
      {/* Weekday header skeleton */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonPulse key={`wk-${i}`} className="h-4 w-full" />
        ))}
      </div>
      {/* Day grid skeleton */}
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={`row-${row}`} className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, col) => (
            <SkeletonPulse key={`day-${row}-${col}`} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ))}
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<string | undefined>(undefined);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  const { events, isLoading, isMutating, error, createEvent, updateEvent, deleteEvent } =
    useCalendarEvents({
      projectPath,
      month: displayMonth.getMonth(),
      year: displayMonth.getFullYear(),
    });

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const defaultClassNames = useMemo(() => getDefaultClassNames(), []);

  const handleMonthChange = useCallback((month: Date) => {
    setDisplayMonth(month);
    setSelectedDate(null);
  }, []);

  const handlePrevMonth = useCallback(() => {
    setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1));
    setSelectedDate(null);
  }, []);

  const handleNextMonth = useCallback(() => {
    setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1));
    setSelectedDate(null);
  }, []);

  const handleToday = useCallback(() => {
    const today = new Date();
    setDisplayMonth(new Date(today.getFullYear(), today.getMonth()));
    setSelectedDate(null);
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    const key = date.toISOString().split('T')[0];
    setSelectedDate((prev) => (prev === key ? null : key));
  }, []);

  const handleNewEvent = useCallback(() => {
    const today = new Date();
    setCreateDefaultDate(today.toISOString().split('T')[0]);
    setShowCreateDialog(true);
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setDetailEvent(event);
    setShowDetailPanel(true);
    setSelectedDate(null);
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
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Calendar</h1>
          {events.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewEvent}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center gap-1"
            data-testid="new-event-button"
          >
            <Plus className="h-3.5 w-3.5" />
            New Event
          </button>
          <button
            onClick={handleToday}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Today
          </button>
          <button
            onClick={handlePrevMonth}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleNextMonth}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading && events.length === 0 ? (
          <CalendarSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-10 w-10 text-destructive/30 mb-3" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <div className="p-4">
            {/* Loading indicator overlay for subsequent fetches */}
            {isLoading && events.length > 0 && (
              <div className="absolute top-2 right-6 z-10">
                <Spinner className="h-4 w-4" />
              </div>
            )}

            <DayPicker
              mode="single"
              month={displayMonth}
              onMonthChange={handleMonthChange}
              fixedWeeks
              showOutsideDays
              hideNavigation
              classNames={{
                root: `${defaultClassNames.root} w-full`,
                months: `${defaultClassNames.months} w-full`,
                month: `${defaultClassNames.month} w-full`,
                month_grid: 'w-full border-collapse',
                weekdays: 'flex w-full',
                weekday: 'flex-1 text-center text-xs font-medium text-muted-foreground py-2',
                week: 'flex w-full',
                day: 'flex-1 text-center p-0 relative',
                day_button:
                  'w-full min-h-[4rem] p-1 rounded-md text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                today: 'font-bold text-primary',
                selected: 'bg-accent text-accent-foreground',
                outside: 'text-muted-foreground/40',
                disabled: 'text-muted-foreground/30',
              }}
              components={{
                DayButton: ({ day, modifiers, ...buttonProps }) => {
                  const date = day.date;
                  const dateStr = date.toISOString().split('T')[0];
                  const dayEvents = eventsByDate.get(dateStr) ?? [];
                  const isSelected = selectedDate === dateStr;
                  const hasEvents = dayEvents.length > 0;
                  const visibleDots = dayEvents.slice(0, MAX_DOTS_PER_DAY);
                  const extraCount = dayEvents.length - MAX_DOTS_PER_DAY;

                  const buttonContent = (
                    <button
                      {...buttonProps}
                      className={cn(
                        'w-full min-h-[4rem] p-1 rounded-md text-sm transition-colors',
                        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        'flex flex-col items-center gap-0.5',
                        isSelected && hasEvents && 'bg-accent text-accent-foreground',
                        modifiers.today && 'font-bold text-primary',
                        modifiers.outside && 'text-muted-foreground/40'
                      )}
                      onClick={(e) => {
                        handleDayClick(date);
                        buttonProps.onClick?.(e);
                      }}
                    >
                      <span className="leading-tight">{date.getDate()}</span>
                      {hasEvents && (
                        <div className="flex items-center gap-0.5 mt-auto">
                          {visibleDots.map((event) => (
                            <EventDot key={event.id} event={event} />
                          ))}
                          {extraCount > 0 && (
                            <span className="text-[8px] text-muted-foreground leading-none">
                              +{extraCount}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );

                  // Wrap in popover only when selected and has events
                  if (isSelected && hasEvents) {
                    return (
                      <Popover open onOpenChange={() => setSelectedDate(null)}>
                        <PopoverTrigger asChild>{buttonContent}</PopoverTrigger>
                        <PopoverContent
                          className="w-72 p-3"
                          align="center"
                          sideOffset={4}
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <DayEventsPopoverContent
                            dateStr={dateStr}
                            events={dayEvents}
                            onEventClick={handleEventClick}
                          />
                        </PopoverContent>
                      </Popover>
                    );
                  }

                  return buttonContent;
                },
              }}
            />
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
        isMutating={isMutating}
      />
    </div>
  );
}
