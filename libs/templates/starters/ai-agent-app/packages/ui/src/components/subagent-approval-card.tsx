/**
 * SubagentApprovalCard — Inline approval UI for subagent tool calls (gated trust model).
 *
 * Shown in the chat message list when a subagent tool call is waiting for
 * human approval in gated trust mode. The card displays the tool name,
 * abbreviated input arguments, and Approve/Deny buttons.
 */

import { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, ShieldX, Loader2, Clock } from 'lucide-react';
import { cn } from '../lib/utils.js';

/** 5-minute approval timeout in milliseconds */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * A pending subagent tool approval received from the server via WebSocket.
 */
export interface PendingSubagentApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  /** ISO timestamp when the approval was received (for 5-minute timeout tracking) */
  receivedAt: string;
}

export interface SubagentApprovalCardProps {
  /** Unique ID for this approval request */
  approvalId: string;
  /** Name of the tool requesting execution */
  toolName: string;
  /** Input arguments passed to the tool */
  toolInput: Record<string, unknown>;
  /** ISO timestamp when the request was received (for timeout tracking) */
  receivedAt: string;
  /** Called when the user clicks Approve */
  onApprove?: (approvalId: string) => void;
  /** Called when the user clicks Deny */
  onDeny?: (approvalId: string) => void;
  className?: string;
}

type CardState = 'pending' | 'approving' | 'denied' | 'expired';

function formatToolName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function abbreviateInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input).slice(0, 3);
  if (entries.length === 0) return '(no arguments)';

  const parts = entries.map(([key, value]) => {
    const strVal =
      typeof value === 'string'
        ? value.length > 50
          ? `"${value.slice(0, 50)}…"`
          : `"${value}"`
        : JSON.stringify(value);
    return `${key}: ${strVal}`;
  });

  const hasMore = Object.keys(input).length > 3;
  return parts.join(', ') + (hasMore ? ', …' : '');
}

export function SubagentApprovalCard({
  approvalId,
  toolName,
  toolInput,
  receivedAt,
  onApprove,
  onDeny,
  className,
}: SubagentApprovalCardProps) {
  const [state, setState] = useState<CardState>('pending');

  // Auto-expire after 5 minutes (matches server-side timeout)
  useEffect(() => {
    const receivedTime = new Date(receivedAt).getTime();
    const remaining = APPROVAL_TIMEOUT_MS - (Date.now() - receivedTime);

    if (remaining <= 0) {
      setState('expired');
      return;
    }

    const timer = setTimeout(() => {
      setState((prev) => (prev === 'pending' ? 'expired' : prev));
    }, remaining);

    return () => clearTimeout(timer);
  }, [receivedAt]);

  function handleApprove() {
    if (state !== 'pending') return;
    setState('approving');
    onApprove?.(approvalId);
  }

  function handleDeny() {
    if (state !== 'pending') return;
    setState('denied');
    onDeny?.(approvalId);
  }

  const displayName = formatToolName(toolName);
  const inputSummary = abbreviateInput(toolInput);

  // ── Expired state ──────────────────────────────────────────────────────────
  if (state === 'expired') {
    return (
      <div
        data-slot="subagent-approval-card"
        data-state="expired"
        className={cn(
          'my-1 flex max-w-full items-center gap-2 overflow-hidden rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground',
          className
        )}
      >
        <Clock className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium">Approval expired</span>
        <span className="text-muted-foreground/40">—</span>
        <span className="truncate text-muted-foreground/70">{displayName}</span>
      </div>
    );
  }

  // ── Denied state ───────────────────────────────────────────────────────────
  if (state === 'denied') {
    return (
      <div
        data-slot="subagent-approval-card"
        data-state="denied"
        className={cn(
          'my-1 flex max-w-full items-center gap-2 overflow-hidden rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground',
          className
        )}
      >
        <ShieldX className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium">Tool denied</span>
        <span className="text-muted-foreground/40">—</span>
        <span className="truncate text-muted-foreground/70">{displayName}</span>
      </div>
    );
  }

  // ── Approving state ────────────────────────────────────────────────────────
  if (state === 'approving') {
    return (
      <div
        data-slot="subagent-approval-card"
        data-state="approving"
        className={cn(
          'my-1 flex max-w-full items-center gap-2 overflow-hidden rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 text-xs',
          className
        )}
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />
        <span className="font-medium text-blue-700 dark:text-blue-300">Approving…</span>
        <span className="text-muted-foreground/40">—</span>
        <span className="truncate text-foreground/60">{displayName}</span>
      </div>
    );
  }

  // ── Pending state (default) ────────────────────────────────────────────────
  return (
    <div
      data-slot="subagent-approval-card"
      data-state="pending"
      className={cn(
        'my-1 max-w-full overflow-hidden rounded-md border border-blue-500/40 bg-blue-500/5 text-xs',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground/90">Subagent tool approval required</p>
          <p className="mt-0.5 font-medium text-foreground/80">{displayName}</p>
          <p
            className="mt-0.5 truncate text-muted-foreground"
            title={JSON.stringify(toolInput, null, 2)}
          >
            {inputSummary}
          </p>
        </div>
        <span className="shrink-0 rounded bg-blue-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
          Subagent
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-blue-500/20 px-3 py-2">
        <button
          type="button"
          onClick={handleApprove}
          className="flex items-center gap-1.5 rounded-md bg-blue-500/15 px-2.5 py-1 font-medium text-blue-700 transition-colors hover:bg-blue-500/25 dark:text-blue-300"
        >
          <ShieldCheck className="size-3" />
          Approve
        </button>
        <button
          type="button"
          onClick={handleDeny}
          className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          <ShieldX className="size-3" />
          Deny
        </button>
      </div>
    </div>
  );
}
