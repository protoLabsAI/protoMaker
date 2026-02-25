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
import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreateEventInput } from './use-calendar-events';

// ============================================================================
// Constants
// ============================================================================

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
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [dateError, setDateError] = useState(false);

  const wasOpenRef = useRef(false);

  // Reset form when dialog opens
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (justOpened) {
      setTitle('');
      setDate(defaultDate ?? '');
      setEndDate('');
      setDescription('');
      setColor('');
      setTitleError(false);
      setDateError(false);
    }
  }, [open, defaultDate]);

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

    if (hasError) return;

    await onSubmit({
      title: title.trim(),
      date,
      endDate: endDate || undefined,
      description: description.trim() || undefined,
      color: color || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="create-event-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            New Event
          </DialogTitle>
          <DialogDescription>Create a custom calendar event.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
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
              placeholder="Event title"
              autoFocus
              className={cn(titleError && 'border-destructive')}
              data-testid="event-title-input"
            />
            {titleError && <p className="text-xs text-destructive">Title is required</p>}
          </div>

          {/* Date */}
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
                min={date || undefined}
                data-testid="event-end-date-input"
              />
            </div>
          </div>

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

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Color (optional)</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {/* No-color option */}
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
            {isMutating ? 'Creating...' : 'Create Event'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
