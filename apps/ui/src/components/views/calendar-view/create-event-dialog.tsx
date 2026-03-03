/**
 * Create Event Dialog
 *
 * A dialog for creating custom calendar events with title, date,
 * optional end date, description, and color.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import { Input } from '@protolabs-ai/ui/atoms';
import { Label } from '@protolabs-ai/ui/atoms';
import { Textarea } from '@protolabs-ai/ui/atoms';
import { HotkeyButton } from '@protolabs-ai/ui/molecules';
import { CalendarPlus, Clock, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JobAction } from '@protolabs-ai/types';
import type { CreateEventInput } from './use-calendar-events';

// ============================================================================
// Constants
// ============================================================================

/** Job action type options */
const JOB_ACTION_TYPES = [
  { value: 'start-agent', label: 'Start Agent' },
  { value: 'run-automation', label: 'Run Automation' },
  { value: 'run-command', label: 'Run Command' },
] as const;

type EventMode = 'event' | 'job';

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
// Props
// ============================================================================

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateEventInput) => Promise<void>;
  /** Pre-fill the date field (YYYY-MM-DD format) */
  defaultDate?: string;
  isMutating?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function CreateEventDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultDate,
  isMutating = false,
}: CreateEventDialogProps) {
  const [mode, setMode] = useState<EventMode>('event');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [dateError, setDateError] = useState(false);

  // Job-specific state
  const [time, setTime] = useState('');
  const [timeError, setTimeError] = useState(false);
  const [actionType, setActionType] = useState<JobAction['type']>('start-agent');
  const [featureId, setFeatureId] = useState('');
  const [automationId, setAutomationId] = useState('');
  const [command, setCommand] = useState('');
  const [commandCwd, setCommandCwd] = useState('');

  const wasOpenRef = useRef(false);

  // Reset form when dialog opens
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (justOpened) {
      setMode('event');
      setTitle('');
      setDate(defaultDate ?? '');
      setEndDate('');
      setDescription('');
      setColor('');
      setTitleError(false);
      setDateError(false);
      setTime('');
      setTimeError(false);
      setActionType('start-agent');
      setFeatureId('');
      setAutomationId('');
      setCommand('');
      setCommandCwd('');
    }
  }, [open, defaultDate]);

  const buildJobAction = (): JobAction | undefined => {
    if (mode !== 'job') return undefined;
    switch (actionType) {
      case 'start-agent':
        return { type: 'start-agent', featureId };
      case 'run-automation':
        return { type: 'run-automation', automationId };
      case 'run-command':
        return { type: 'run-command', command, ...(commandCwd && { cwd: commandCwd }) };
    }
  };

  const handleSubmit = async () => {
    let hasError = false;

    if (!title.trim()) {
      setTitleError(true);
      hasError = true;
    }

    if (!date) {
      setDateError(true);
      hasError = true;
    }

    if (mode === 'job' && !time) {
      setTimeError(true);
      hasError = true;
    }

    if (hasError) return;

    await onSubmit({
      title: title.trim(),
      date,
      ...(mode === 'event' && { endDate: endDate || undefined }),
      description: description.trim() || undefined,
      color: color || undefined,
      ...(mode === 'job' && {
        type: 'job' as const,
        time,
        jobAction: buildJobAction(),
      }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="create-event-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'job' ? <Play className="h-5 w-5" /> : <CalendarPlus className="h-5 w-5" />}
            {mode === 'job' ? 'New Job' : 'New Event'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'job'
              ? 'Schedule a one-time action to run at a specific date and time.'
              : 'Create a custom calendar event.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('event')}
              className={cn(
                'flex-1 px-3 py-1.5 text-sm font-medium transition-colors',
                mode === 'event'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent'
              )}
            >
              Event
            </button>
            <button
              type="button"
              onClick={() => setMode('job')}
              className={cn(
                'flex-1 px-3 py-1.5 text-sm font-medium transition-colors',
                mode === 'job'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent'
              )}
            >
              Job
            </button>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) setTitleError(false);
              }}
              placeholder={mode === 'job' ? 'Job name' : 'Event title'}
              autoFocus
              className={cn(titleError && 'border-destructive')}
              data-testid="event-title-input"
            />
            {titleError && <p className="text-xs text-destructive">Title is required</p>}
          </div>

          {/* Date + Time (job) or Date + End Date (event) */}
          {mode === 'job' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="event-date">Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (e.target.value) setDateError(false);
                  }}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className={cn(dateError && 'border-destructive')}
                  data-testid="event-date-input"
                />
                {dateError && <p className="text-xs text-destructive">Date is required</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-time">
                  <Clock className="inline h-3 w-3 mr-1" />
                  Time
                </Label>
                <Input
                  id="event-time"
                  type="time"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value);
                    if (e.target.value) setTimeError(false);
                  }}
                  className={cn(timeError && 'border-destructive')}
                  data-testid="event-time-input"
                />
                {timeError && <p className="text-xs text-destructive">Time is required</p>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="event-date">Start Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (e.target.value) setDateError(false);
                  }}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className={cn(dateError && 'border-destructive')}
                  data-testid="event-date-input"
                />
                {dateError && <p className="text-xs text-destructive">Date is required</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end-date">End Date (optional)</Label>
                <Input
                  id="event-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  min={date || undefined}
                  data-testid="event-end-date-input"
                />
              </div>
            </div>
          )}

          {/* Job action fields */}
          {mode === 'job' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Action Type</Label>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {JOB_ACTION_TYPES.map((at) => (
                    <button
                      key={at.value}
                      type="button"
                      onClick={() => setActionType(at.value)}
                      className={cn(
                        'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
                        actionType === at.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {at.label}
                    </button>
                  ))}
                </div>
              </div>

              {actionType === 'start-agent' && (
                <div className="space-y-2">
                  <Label htmlFor="job-feature-id">Feature ID</Label>
                  <Input
                    id="job-feature-id"
                    value={featureId}
                    onChange={(e) => setFeatureId(e.target.value)}
                    placeholder="feature-123..."
                    data-testid="job-feature-id-input"
                  />
                </div>
              )}

              {actionType === 'run-automation' && (
                <div className="space-y-2">
                  <Label htmlFor="job-automation-id">Automation ID</Label>
                  <Input
                    id="job-automation-id"
                    value={automationId}
                    onChange={(e) => setAutomationId(e.target.value)}
                    placeholder="automation-id..."
                    data-testid="job-automation-id-input"
                  />
                </div>
              )}

              {actionType === 'run-command' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="job-command">Command</Label>
                    <Input
                      id="job-command"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="npm run build"
                      className="font-mono text-sm"
                      data-testid="job-command-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="job-cwd">Working Directory (optional)</Label>
                    <Input
                      id="job-cwd"
                      value={commandCwd}
                      onChange={(e) => setCommandCwd(e.target.value)}
                      placeholder="/path/to/project"
                      className="font-mono text-sm"
                      data-testid="job-cwd-input"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="event-description">Description (optional)</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
              data-testid="event-description-input"
            />
          </div>

          {/* Color picker (events only) */}
          {mode === 'event' && (
            <div className="space-y-2">
              <Label>Color (optional)</Label>
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
                  data-testid="event-color-default"
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
                    data-testid={`event-color-${preset.label.toLowerCase()}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <HotkeyButton
            onClick={handleSubmit}
            disabled={isMutating}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-create-event"
          >
            {isMutating ? 'Creating...' : mode === 'job' ? 'Schedule Job' : 'Create Event'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
