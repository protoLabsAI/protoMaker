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

import { useState, useEffect } from 'react';
import { ChevronDown, Loader2, Check, AlertTriangle, Wrench } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { formatToolName } from './tool-invocation-part.js';

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
}

export interface TaskBlockProps {
  tools: ToolInvocationItem[];
  className?: string;
}

/** Human-readable action labels for known tool names */
const TOOL_TITLE_MAP: Record<string, string> = {
  get_board_summary: 'Checking board',
  list_features: 'Listing features',
  get_feature: 'Checking features',
  create_feature: 'Creating feature',
  update_feature: 'Updating board',
  move_feature: 'Moving feature',
  start_agent: 'Starting agent',
  stop_agent: 'Stopping agent',
  get_agent_output: 'Checking agents',
  get_auto_mode_status: 'Checking auto mode',
  get_execution_order: 'Planning execution',
};

/** Infer a human-readable block title from the first tool in the group */
function inferBlockTitle(tools: ToolInvocationItem[]): string {
  if (tools.length === 0) return 'Working…';
  const firstName = tools[0].toolName;
  return TOOL_TITLE_MAP[firstName] ?? formatToolName(firstName);
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
export function TaskBlock({ tools, className }: TaskBlockProps) {
  const allDone = tools.length > 0 && tools.every((t) => DONE_STATES.includes(t.state));

  // Open by default; auto-collapse when every tool has a terminal state
  const [isOpen, setIsOpen] = useState(true);
  useEffect(() => {
    if (allDone) setIsOpen(false);
  }, [allDone]);

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
        className
      )}
    >
      {/* Collapsible header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
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
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Tool rows (expanded view) */}
      {isOpen && (
        <div className="border-t border-border/50 pt-0.5 pb-1">
          {tools.map((tool) => (
            <ToolRow key={tool.toolCallId} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
