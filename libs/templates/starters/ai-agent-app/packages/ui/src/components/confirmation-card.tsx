/**
 * ConfirmationCard — Inline confirmation UI for destructive tool calls.
 *
 * Shown in the message stream when a destructive tool call requires human
 * approval before executing.
 *
 * Renders three visual states:
 *   - approval-requested: Yellow accent, action summary, Approve/Reject buttons
 *   - approval-responded: Spinner "Approving…" while the action is being executed
 *   - output-denied:      Muted "Action denied" summary
 */

import { useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldX, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { formatToolName } from './tool-invocation-part.js';

export interface ConfirmationCardProps {
  /** The tool name that requires confirmation */
  toolName: string;
  /** The input arguments passed to the tool */
  input?: unknown;
  /** Optional human-readable summary of the action */
  summary?: string;
  /**
   * External state:
   *   - approval-requested: awaiting user decision (default)
   *   - approval-responded: user approved, action is executing
   *   - output-denied:      user or system denied the action
   */
  state?: 'approval-requested' | 'approval-responded' | 'output-denied';
  /** Called when the user clicks Approve */
  onApprove?: () => void;
  /** Called when the user clicks Reject */
  onReject?: () => void;
  className?: string;
}

/** Internal clicked state for immediate visual feedback */
type ClickedState = 'idle' | 'approving' | 'rejected';

/**
 * Build a human-readable action summary from the tool name and input args.
 * Falls back to the formatted tool name when no specific pattern is found.
 */
function buildSummary(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return formatToolName(toolName);
  const args = input as Record<string, unknown>;

  switch (toolName) {
    case 'delete_feature':
      return args.featureId ? `Delete feature "${args.featureId}"` : 'Delete feature';
    case 'stop_agent':
      return args.sessionId ? `Stop agent session "${args.sessionId}"` : 'Stop agent';
    case 'start_auto_mode': {
      const c = args.maxConcurrency as number | undefined;
      return c ? `Start auto mode with ${c} parallel workers` : 'Start auto mode';
    }
    default:
      return formatToolName(toolName);
  }
}

export function ConfirmationCard({
  toolName,
  input,
  summary: summaryProp,
  state: externalState = 'approval-requested',
  onApprove,
  onReject,
  className,
}: ConfirmationCardProps) {
  const [clicked, setClicked] = useState<ClickedState>('idle');

  // Derive the effective display state: clicked state wins once set
  const displayState: 'approval-requested' | 'approval-responded' | 'output-denied' =
    clicked === 'approving'
      ? 'approval-responded'
      : clicked === 'rejected'
        ? 'output-denied'
        : externalState;

  const summary = summaryProp ?? buildSummary(toolName, input);

  function handleApprove() {
    if (clicked !== 'idle') return;
    setClicked('approving');
    onApprove?.();
  }

  function handleReject() {
    if (clicked !== 'idle') return;
    setClicked('rejected');
    onReject?.();
  }

  // ── Denied state ─────────────────────────────────────────────────────────
  if (displayState === 'output-denied') {
    return (
      <div
        data-slot="confirmation-card"
        data-state="denied"
        className={cn(
          'my-1 flex max-w-full items-center gap-2 overflow-hidden rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground',
          className
        )}
      >
        <ShieldX className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium">Action denied</span>
        <span className="text-muted-foreground/40">—</span>
        <span className="truncate text-muted-foreground/70">{summary}</span>
      </div>
    );
  }

  // ── Approval-responded (spinner while executing) ──────────────────────────
  if (displayState === 'approval-responded') {
    return (
      <div
        data-slot="confirmation-card"
        data-state="responded"
        className={cn(
          'my-1 flex max-w-full items-center gap-2 overflow-hidden rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5 text-xs',
          className
        )}
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin text-yellow-500" />
        <span className="font-medium text-yellow-700 dark:text-yellow-300">Approving…</span>
        <span className="text-muted-foreground/40">—</span>
        <span className="truncate text-foreground/60">{summary}</span>
      </div>
    );
  }

  // ── Approval-requested (default) ─────────────────────────────────────────
  return (
    <div
      data-slot="confirmation-card"
      data-state="approval-requested"
      className={cn(
        'my-1 max-w-full overflow-hidden rounded-md border border-yellow-500/40 bg-yellow-500/5 text-xs',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-yellow-500" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground/90">Confirmation required</p>
          <p className="mt-0.5 truncate text-muted-foreground">{summary}</p>
        </div>
        <span className="shrink-0 rounded bg-yellow-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
          HITL
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-yellow-500/20 px-3 py-2">
        <button
          type="button"
          onClick={handleApprove}
          className="flex items-center gap-1.5 rounded-md bg-yellow-500/15 px-2.5 py-1 font-medium text-yellow-700 transition-colors hover:bg-yellow-500/25 dark:text-yellow-300"
        >
          <ShieldCheck className="size-3" />
          Approve
        </button>
        <button
          type="button"
          onClick={handleReject}
          className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          <ShieldX className="size-3" />
          Reject
        </button>
      </div>
    </div>
  );
}
