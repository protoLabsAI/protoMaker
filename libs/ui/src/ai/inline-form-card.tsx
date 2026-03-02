/**
 * InlineFormCard — Chat-stream-sized card for collecting structured input.
 *
 * Renders inline in the message stream (like ConfirmationCard) but wraps
 * arbitrary form content passed via `children`. Three visual states:
 *   - pending:   Blue accent, form fields visible, Submit/Cancel buttons
 *   - submitted: Green accent, "Response submitted" summary
 *   - cancelled: Muted, "Form cancelled" summary
 *
 * The actual form fields (e.g. RJSF) are composed in `apps/ui/` and passed
 * as children. This component handles the card chrome only.
 */

import { useState, type ReactNode } from 'react';
import { ClipboardList, CheckCircle2, XCircle, Loader2, Send } from 'lucide-react';
import { cn } from '../lib/utils.js';

export type InlineFormCardState = 'pending' | 'submitted' | 'cancelled';

export interface InlineFormCardProps {
  /** Form title displayed in the card header */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Visual state of the form card */
  state?: InlineFormCardState;
  /** Form content — pass RJSF or any form elements here */
  children?: ReactNode;
  /** Called when the user clicks Submit */
  onSubmit?: () => void;
  /** Called when the user clicks Cancel */
  onCancel?: () => void;
  /** Whether submission is in progress (shows spinner) */
  isSubmitting?: boolean;
  /** Optional label for the submit button (default: "Submit") */
  submitLabel?: string;
  className?: string;
}

export function InlineFormCard({
  title,
  description,
  state = 'pending',
  children,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = 'Submit',
  className,
}: InlineFormCardProps) {
  const [localCancelled, setLocalCancelled] = useState(false);

  const effectiveState = localCancelled ? 'cancelled' : state;

  function handleCancel() {
    setLocalCancelled(true);
    onCancel?.();
  }

  // ── Submitted state ──────────────────────────────────────────────────────
  if (effectiveState === 'submitted') {
    return (
      <div
        data-slot="inline-form-card"
        data-state="submitted"
        className={cn(
          'my-1 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs',
          className
        )}
      >
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          Response submitted
        </span>
        <span className="text-muted-foreground/40">&mdash;</span>
        <span className="truncate text-foreground/60">{title}</span>
      </div>
    );
  }

  // ── Cancelled state ──────────────────────────────────────────────────────
  if (effectiveState === 'cancelled') {
    return (
      <div
        data-slot="inline-form-card"
        data-state="cancelled"
        className={cn(
          'my-1 flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground',
          className
        )}
      >
        <XCircle className="size-3.5 shrink-0" />
        <span className="font-medium">Form cancelled</span>
        <span className="text-muted-foreground/40">&mdash;</span>
        <span className="truncate text-muted-foreground/70">{title}</span>
      </div>
    );
  }

  // ── Pending state (default) ──────────────────────────────────────────────
  return (
    <div
      data-slot="inline-form-card"
      data-state="pending"
      className={cn('my-1 rounded-md border border-blue-500/40 bg-blue-500/5 text-sm', className)}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground/90">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>

      {/* Form content slot */}
      {children && <div className="border-t border-blue-500/20 px-3 py-3">{children}</div>}

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-blue-500/20 px-3 py-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            'bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 dark:text-blue-300',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          {isSubmitting ? 'Submitting...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            'bg-muted/60 text-muted-foreground hover:bg-muted',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <XCircle className="size-3" />
          Cancel
        </button>
      </div>
    </div>
  );
}
