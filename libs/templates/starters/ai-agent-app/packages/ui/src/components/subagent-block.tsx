/**
 * SubagentBlock — Collapsible card for rendering Agent tool (subagent) results.
 *
 * Renders each subagent invocation as a compact collapsible card with:
 *  - Subagent type badge (e.g. "Agent", "Task", custom type)
 *  - Status indicator: spinner while running, checkmark when done, X on failure
 *  - Description of what the subagent was asked to do
 *  - Collapsible result summary (collapsed by default, expands on click)
 */

import { useState } from 'react';
import { ChevronDown, Loader2, Check, X, Bot } from 'lucide-react';
import { cn } from '../lib/utils.js';
import type { ToolResultRendererProps } from './tool-result-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubagentStatus = 'running' | 'done' | 'error';

export interface SubagentBlockProps {
  /** The type of subagent (e.g. "Agent", "Researcher", "Coder") */
  subagentType?: string;
  /** Short description of what the subagent was asked to do */
  description?: string;
  /** Current execution status */
  status: SubagentStatus;
  /** The result text or summary returned by the subagent */
  result?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const statusConfig: Record<
  SubagentStatus,
  { icon: typeof Loader2; spinning: boolean; colorClass: string; badgeClass: string; label: string }
> = {
  running: {
    icon: Loader2,
    spinning: true,
    colorClass: 'text-primary',
    badgeClass: 'bg-primary/15 text-primary',
    label: 'Running',
  },
  done: {
    icon: Check,
    spinning: false,
    colorClass: 'text-green-500',
    badgeClass: 'bg-green-500/15 text-green-600 dark:text-green-400',
    label: 'Done',
  },
  error: {
    icon: X,
    spinning: false,
    colorClass: 'text-destructive',
    badgeClass: 'bg-destructive/15 text-destructive',
    label: 'Failed',
  },
};

// ---------------------------------------------------------------------------
// SubagentBlock
// ---------------------------------------------------------------------------

export function SubagentBlock({
  subagentType = 'Agent',
  description,
  status,
  result,
  className,
}: SubagentBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  const config = statusConfig[status] ?? statusConfig.running;
  const StatusIcon = config.icon;
  const hasResult = Boolean(result);

  return (
    <div
      data-slot="subagent-block"
      className={cn(
        'my-1 rounded-md border border-border/50 bg-muted/30 text-xs',
        status === 'error' && 'border-destructive/30',
        className
      )}
    >
      {/* Header row */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-label={`${subagentType}${description ? `: ${description}` : ''} — ${config.label}`}
        disabled={!hasResult}
      >
        <Bot className="size-3.5 shrink-0 text-muted-foreground" />

        {/* Description */}
        <span className="flex-1 truncate font-medium text-foreground/80">
          {description || subagentType}
        </span>

        {/* Subagent type badge */}
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
            config.badgeClass
          )}
        >
          {subagentType}
        </span>

        {/* Status icon */}
        <StatusIcon
          className={cn('size-3.5 shrink-0', config.colorClass, config.spinning && 'animate-spin')}
          aria-label={config.label}
        />

        {/* Expand chevron — only shown when there's a result to expand */}
        {hasResult && (
          <ChevronDown
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        )}
      </button>

      {/* Expanded result */}
      {isOpen && hasResult && (
        <div className="border-t border-border/50 px-2.5 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Result
          </span>
          <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubagentBlockRenderer — ToolResultRenderer for the "Agent" tool
// ---------------------------------------------------------------------------

function extractResultText(output: unknown): string | undefined {
  if (!output) return undefined;
  if (typeof output === 'string') return output || undefined;

  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if ('data' in o) return extractResultText(o.data);
    if ('result' in o && typeof o.result === 'string') return o.result || undefined;
    if ('summary' in o && typeof o.summary === 'string') return o.summary || undefined;
    try {
      const json = JSON.stringify(o, null, 2);
      return json !== '{}' ? json : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractInputFields(input: unknown): { subagentType?: string; description?: string } {
  if (!input || typeof input !== 'object') return {};
  const i = input as Record<string, unknown>;

  return {
    subagentType: typeof i.subagent_type === 'string' ? i.subagent_type : undefined,
    description: typeof i.description === 'string' ? i.description : undefined,
  };
}

export function SubagentBlockRenderer({ output, input, state }: ToolResultRendererProps) {
  const isRunning =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';
  const isError = state === 'output-error' || state === 'output-denied';

  const status: SubagentStatus = isRunning ? 'running' : isError ? 'error' : 'done';
  const { subagentType, description } = extractInputFields(input);
  const result = isRunning ? undefined : extractResultText(output);

  return (
    <SubagentBlock
      subagentType={subagentType ?? 'Agent'}
      description={description}
      status={status}
      result={result}
    />
  );
}
