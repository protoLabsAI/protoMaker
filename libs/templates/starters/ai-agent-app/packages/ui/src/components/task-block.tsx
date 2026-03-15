/**
 * TaskBlock — Groups multiple tool invocations from a single agentic step.
 *
 * When the assistant calls multiple tools in one step, they render as a unified
 * collapsible block with:
 *  - A summary title inferred from the first tool in the group
 *  - Individual tool rows showing name + status icon
 *  - Auto-collapse when all tools complete
 *
 * Single-tool steps bypass TaskBlock entirely and render as individual
 * ToolInvocationPart cards (no wrapping).
 */

import { useState } from 'react';
import { ChevronDown, Loader2, Check, AlertTriangle, Wrench } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { formatToolName } from './tool-invocation-part.js';
import { ConfirmationCard } from './confirmation-card.js';

export type TaskToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

export interface ToolInvocationItem {
  toolName: string;
  toolCallId: string;
  state: TaskToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  title?: string;
  /** Native AI SDK approval ID — present when state is 'approval-requested' */
  approvalId?: string;
}

export interface TaskBlockProps {
  tools: ToolInvocationItem[];
  className?: string;
  /** Called when user approves a destructive tool call (HITL flow) */
  onToolApprove?: (approvalId: string) => void;
  /** Called when user rejects a destructive tool call (HITL flow) */
  onToolReject?: (approvalId: string) => void;
}

/** Infer a human-readable block title from the first tool in the group */
function inferBlockTitle(tools: ToolInvocationItem[]): string {
  if (tools.length === 0) return 'Working…';
  const firstName = tools[0].toolName;
  return formatToolName(firstName);
}

const DONE_STATES: TaskToolState[] = ['output-available', 'output-error', 'output-denied'];

const stateDisplay: Record<
  TaskToolState,
  { icon: typeof Loader2; spinning: boolean; colorClass: string; label: string }
> = {
  'input-streaming': {
    icon: Loader2,
    spinning: true,
    colorClass: 'text-primary',
    label: 'Running',
  },
  'input-available': {
    icon: Loader2,
    spinning: true,
    colorClass: 'text-primary',
    label: 'Running',
  },
  'approval-requested': {
    icon: Loader2,
    spinning: true,
    colorClass: 'text-yellow-500',
    label: 'Awaiting',
  },
  'approval-responded': {
    icon: Loader2,
    spinning: true,
    colorClass: 'text-primary',
    label: 'Running',
  },
  'output-available': {
    icon: Check,
    spinning: false,
    colorClass: 'text-green-500',
    label: 'Done',
  },
  'output-error': {
    icon: AlertTriangle,
    spinning: false,
    colorClass: 'text-destructive',
    label: 'Error',
  },
  'output-denied': {
    icon: AlertTriangle,
    spinning: false,
    colorClass: 'text-muted-foreground',
    label: 'Denied',
  },
};

/** Compact row rendered for each tool inside an expanded TaskBlock */
function ToolRow({ tool }: { tool: ToolInvocationItem }) {
  const display = stateDisplay[tool.state] ?? stateDisplay['input-available'];
  const Icon = display.icon;

  return (
    <div data-slot="task-block-tool-row" className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <Wrench className="size-3 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-foreground/70">
        {tool.title || formatToolName(tool.toolName)}
      </span>
      <span className={cn('flex items-center gap-0.5', display.colorClass)}>
        <Icon
          className={cn('size-3 shrink-0', display.spinning && 'animate-spin')}
          aria-label={display.label}
        />
        <span className="text-[10px]">{display.label}</span>
      </span>
    </div>
  );
}

/**
 * TaskBlock renders multiple tool invocations from one agentic step as a
 * unified, collapsible activity feed. It auto-collapses when all tools finish.
 */
export function TaskBlock({ tools, className, onToolApprove, onToolReject }: TaskBlockProps) {
  const allDone = tools.length > 0 && tools.every((t) => DONE_STATES.includes(t.state));
  const hasApprovalPending = tools.some(
    (t) => t.state === 'approval-requested' || t.state === 'output-denied'
  );

  // Default collapsed — but auto-expand when approval is needed
  const [isOpen, setIsOpen] = useState(false);
  const effectiveOpen = isOpen || hasApprovalPending;

  const title = inferBlockTitle(tools);
  const completedCount = tools.filter((t) => DONE_STATES.includes(t.state)).length;
  const hasError = tools.some((t) => t.state === 'output-error');
  const isRunning = !allDone;

  return (
    <div
      data-slot="task-block"
      className={cn(
        'my-1.5 rounded-md border border-border/50 bg-muted/30 text-xs',
        hasError && 'border-destructive/30',
        hasApprovalPending && 'border-yellow-500/40',
        className
      )}
    >
      {/* Collapsible header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={effectiveOpen}
        aria-label={`${title} — ${completedCount} of ${tools.length} done`}
      >
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-medium text-foreground/80">{title}</span>

        {/* Progress counter */}
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {completedCount}/{tools.length}
        </span>

        {/* Overall status icon */}
        {isRunning ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
        ) : hasError ? (
          <AlertTriangle className="size-3 shrink-0 text-destructive" />
        ) : (
          <Check className="size-3 shrink-0 text-green-500" />
        )}

        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            effectiveOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Tool rows (expanded view) — auto-expands when approval is needed */}
      {effectiveOpen && (
        <div className="border-t border-border/50 pt-0.5 pb-1">
          {tools.map((tool) => {
            // Render ConfirmationCard for tools awaiting approval
            if (tool.state === 'approval-requested' || tool.state === 'output-denied') {
              return (
                <ConfirmationCard
                  key={tool.toolCallId}
                  toolName={tool.toolName}
                  input={tool.input}
                  state={tool.state === 'output-denied' ? 'output-denied' : 'approval-requested'}
                  onApprove={
                    onToolApprove && tool.approvalId
                      ? () => onToolApprove(tool.approvalId!)
                      : undefined
                  }
                  onReject={
                    onToolReject && tool.approvalId
                      ? () => onToolReject(tool.approvalId!)
                      : undefined
                  }
                  className="mx-2 my-1"
                />
              );
            }
            return <ToolRow key={tool.toolCallId} tool={tool} />;
          })}
        </div>
      )}
    </div>
  );
}
