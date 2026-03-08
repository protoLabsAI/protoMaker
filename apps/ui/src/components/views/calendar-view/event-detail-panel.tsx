/**
 * Event Detail Panel
 *
 * Displays event details in a dialog. Custom events can be edited and deleted.
 * Feature/milestone/google events are shown read-only with source links.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { Input } from '@protolabsai/ui/atoms';
import { Label } from '@protolabsai/ui/atoms';
import { Textarea } from '@protolabsai/ui/atoms';
import { HotkeyButton } from '@protolabsai/ui/molecules';
import { CalendarDays, Clock, ExternalLink, Pencil, Play, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import type { CalendarEvent, CalendarEventType, JobStatus } from '@protolabsai/types';
import type { UpdateEventInput } from './use-calendar-events';

// ============================================================================
// Constants
// ============================================================================

/** Human-readable labels for event types */
const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  feature: 'Feature',
  milestone: 'Milestone',
  custom: 'Custom',
  google: 'Google Calendar',
  job: 'Scheduled Job',
  ceremony: 'Ceremony',
};

/** Job status badge styles */
const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  completed: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/20 text-destructive',
};

/** Job action type labels */
const JOB_ACTION_LABELS: Record<string, string> = {
  'start-agent': 'Start Agent',
  'run-automation': 'Run Automation',
  'run-command': 'Run Command',
};

/** Preset color options for custom events */
const COLOR_PRESETS = [
  { value: '#10b981', label: 'Emerald' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#84cc16', label: 'Lime' },
];

// ============================================================================
// Helpers
// ============================================================================

/** Format a YYYY-MM-DD string to a readable date */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Props
// ============================================================================

interface EventDetailPanelProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: UpdateEventInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRunJob?: (id: string) => Promise<void>;
  isMutating?: boolean;
}

// ============================================================================
// Read-only view for non-custom events
// ============================================================================

function ReadOnlyEventDetail({ event }: { event: CalendarEvent }) {
  return (
    <div className="py-4 space-y-4">
      {/* Type badge */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: event.color ?? undefined }}
        />
        <span className="text-sm font-medium text-muted-foreground">
          {EVENT_TYPE_LABELS[event.type] ?? event.type}
        </span>
      </div>

      {/* Date info */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {formatDate(event.date)}
          {event.endDate && event.endDate !== event.date && (
            <span> &mdash; {formatDate(event.endDate)}</span>
          )}
        </p>
      </div>

      {/* Description */}
      {event.description && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Description</Label>
          <p className="text-sm whitespace-pre-wrap">{event.description}</p>
        </div>
      )}

      {/* Source link */}
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View source
        </a>
      )}
    </div>
  );
}

// ============================================================================
// Job event detail view
// ============================================================================

function JobEventDetail({
  event,
  onRunJob,
  onDelete,
  isMutating,
}: {
  event: CalendarEvent;
  onRunJob?: (id: string) => Promise<void>;
  onDelete: () => Promise<void>;
  isMutating: boolean;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isPending = event.jobStatus === 'pending';

  return (
    <>
      <div className="py-4 space-y-4">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Play className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-sm font-medium text-muted-foreground">Scheduled Job</span>
          {event.jobStatus && (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                JOB_STATUS_STYLES[event.jobStatus]
              )}
            >
              {event.jobStatus}
            </span>
          )}
        </div>

        {/* Schedule */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Schedule</Label>
          <p className="text-sm">
            {formatDate(event.date)}
            {event.time && (
              <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {event.time}
              </span>
            )}
          </p>
        </div>

        {/* Action details */}
        {event.jobAction && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Action</Label>
            <p className="text-sm font-medium">
              {JOB_ACTION_LABELS[event.jobAction.type] ?? event.jobAction.type}
            </p>
            <div className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
              {event.jobAction.type === 'start-agent' && `Feature: ${event.jobAction.featureId}`}
              {event.jobAction.type === 'run-automation' &&
                `Automation: ${event.jobAction.automationId}`}
              {event.jobAction.type === 'run-command' && (
                <>
                  <div>$ {event.jobAction.command}</div>
                  {event.jobAction.cwd && (
                    <div className="opacity-60">cwd: {event.jobAction.cwd}</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <p className="text-sm whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        {/* Execution result */}
        {event.jobResult && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Execution Result</Label>
            <div className="text-xs space-y-0.5 bg-muted/50 rounded px-2 py-1.5">
              <div>Started: {new Date(event.jobResult.startedAt).toLocaleString()}</div>
              <div>Completed: {new Date(event.jobResult.completedAt).toLocaleString()}</div>
              <div>Duration: {(event.jobResult.durationMs / 1000).toFixed(1)}s</div>
              {event.jobResult.error && (
                <div className="text-destructive mt-1 font-mono">{event.jobResult.error}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          className="text-destructive hover:text-destructive mr-auto"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
        {isPending && onRunJob && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRunJob(event.id)}
            disabled={isMutating}
            data-testid="run-job-now-button"
          >
            <Play className="h-4 w-4 mr-1" />
            Run Now
          </Button>
        )}
      </DialogFooter>

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={onDelete}
        title="Delete Job"
        description={`Are you sure you want to delete "${event.title}"? This action cannot be undone.`}
        testId="delete-job-confirm-dialog"
        confirmTestId="confirm-delete-job"
      />
    </>
  );
}

// ============================================================================
// Editable view for custom events
// ============================================================================

function EditableEventDetail({
  event,
  onSave,
  onDelete,
  isMutating,
}: {
  event: CalendarEvent;
  onSave: (updates: UpdateEventInput) => Promise<void>;
  onDelete: () => Promise<void>;
  isMutating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [endDate, setEndDate] = useState(event.endDate ?? '');
  const [description, setDescription] = useState(event.description ?? '');
  const [color, setColor] = useState(event.color ?? '');
  const [titleError, setTitleError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync form state when event changes
  const prevEventIdRef = useRef(event.id);
  useEffect(() => {
    if (prevEventIdRef.current !== event.id) {
      prevEventIdRef.current = event.id;
      setIsEditing(false);
      setTitle(event.title);
      setDate(event.date);
      setEndDate(event.endDate ?? '');
      setDescription(event.description ?? '');
      setColor(event.color ?? '');
      setTitleError(false);
      setDateError(false);
    }
  }, [event]);

  const handleSave = async () => {
    let hasError = false;

    if (!title.trim()) {
      setTitleError(true);
      hasError = true;
    }
    if (!date) {
      setDateError(true);
      hasError = true;
    }
    if (hasError) return;

    await onSave({
      title: title.trim(),
      date,
      endDate: endDate || undefined,
      description: description.trim() || undefined,
      color: color || undefined,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setTitle(event.title);
    setDate(event.date);
    setEndDate(event.endDate ?? '');
    setDescription(event.description ?? '');
    setColor(event.color ?? '');
    setTitleError(false);
    setDateError(false);
  };

  if (!isEditing) {
    return (
      <>
        <div className="py-4 space-y-4">
          {/* Type badge and color dot */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: event.color ?? '#10b981' }}
            />
            <span className="text-sm font-medium text-muted-foreground">Custom Event</span>
          </div>

          {/* Date info */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {formatDate(event.date)}
              {event.endDate && event.endDate !== event.date && (
                <span> &mdash; {formatDate(event.endDate)}</span>
              )}
            </p>
          </div>

          {/* Description */}
          {event.description && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-destructive hover:text-destructive mr-auto"
            data-testid="delete-event-button"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </DialogFooter>

        <DeleteConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          onConfirm={onDelete}
          title="Delete Event"
          description={`Are you sure you want to delete "${event.title}"? This action cannot be undone.`}
          testId="delete-event-confirm-dialog"
          confirmTestId="confirm-delete-event"
        />
      </>
    );
  }

  // Edit mode
  return (
    <div className="py-4 space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="edit-event-title">Title</Label>
        <Input
          id="edit-event-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setTitleError(false);
          }}
          className={cn(titleError && 'border-destructive')}
          autoFocus
          data-testid="edit-event-title-input"
        />
        {titleError && <p className="text-xs text-destructive">Title is required</p>}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="edit-event-date">Start Date</Label>
          <Input
            id="edit-event-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value) setDateError(false);
            }}
            className={cn(dateError && 'border-destructive')}
            data-testid="edit-event-date-input"
          />
          {dateError && <p className="text-xs text-destructive">Date is required</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-event-end-date">End Date (optional)</Label>
          <Input
            id="edit-event-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={date || undefined}
            data-testid="edit-event-end-date-input"
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="edit-event-description">Description (optional)</Label>
        <Textarea
          id="edit-event-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description..."
          rows={3}
          data-testid="edit-event-description-input"
        />
      </div>

      {/* Color picker */}
      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setColor('')}
            className={cn(
              'h-6 w-6 rounded-full border-2 transition-all',
              'bg-emerald-500/20',
              !color
                ? 'border-foreground ring-2 ring-foreground/20'
                : 'border-transparent hover:border-muted-foreground/40'
            )}
            title="Default"
          />
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setColor(preset.value)}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-all',
                color === preset.value
                  ? 'border-foreground ring-2 ring-foreground/20'
                  : 'border-transparent hover:border-muted-foreground/40'
              )}
              style={{ backgroundColor: preset.value }}
              title={preset.label}
            />
          ))}
        </div>
      </div>

      {/* Edit mode footer */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={isMutating}>
          Cancel
        </Button>
        <HotkeyButton
          size="sm"
          onClick={handleSave}
          disabled={isMutating}
          hotkey={{ key: 'Enter', cmdCtrl: true }}
          hotkeyActive={true}
          data-testid="save-event-changes"
        >
          {isMutating ? 'Saving...' : 'Save Changes'}
        </HotkeyButton>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EventDetailPanel({
  event,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onRunJob,
  isMutating = false,
}: EventDetailPanelProps) {
  if (!event) return null;

  const isCustom = event.type === 'custom';
  const isJob = event.type === 'job';

  const handleUpdate = async (updates: UpdateEventInput) => {
    await onUpdate(event.id, updates);
  };

  const handleDelete = async () => {
    await onDelete(event.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="event-detail-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isJob ? <Play className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
            {event.title}
          </DialogTitle>
          <DialogDescription>
            {isCustom
              ? 'Custom event details'
              : `${EVENT_TYPE_LABELS[event.type] ?? event.type} event`}
          </DialogDescription>
        </DialogHeader>

        {isJob ? (
          <JobEventDetail
            event={event}
            onRunJob={onRunJob}
            onDelete={handleDelete}
            isMutating={isMutating}
          />
        ) : isCustom ? (
          <EditableEventDetail
            event={event}
            onSave={handleUpdate}
            onDelete={handleDelete}
            isMutating={isMutating}
          />
        ) : (
          <>
            <ReadOnlyEventDetail event={event} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
