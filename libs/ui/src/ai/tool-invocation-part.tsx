/**
 * ToolInvocationPart — Collapsible card for rendering tool calls in chat.
 *
 * Displays the tool name, state badge, and expandable input/output.
 * Uses the ToolResultRegistry to render custom UI for known tools,
 * falling back to JSON preview for unknown tools.
 *
 * Supports all AI SDK tool invocation states: streaming, available,
 * output-available, and output-error.
 */

import { useState } from 'react';
import { ChevronDown, Wrench, Loader2, Check, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { toolResultRegistry } from './tool-result-registry.js';
import { BoardSummaryCard } from './tool-results/board-summary-card.js';
import { FeatureListCard } from './tool-results/feature-list-card.js';
import { FeatureDetailCard } from './tool-results/feature-detail-card.js';

// Register custom renderers for the boardRead tool group
toolResultRegistry.register('get_board_summary', BoardSummaryCard);
toolResultRegistry.register('list_features', FeatureListCard);
toolResultRegistry.register('get_feature', FeatureDetailCard);

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

export interface ToolInvocationPartProps {
  toolName: string;
  toolCallId: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  title?: string;
  className?: string;
}

const stateConfig: Record<ToolState, { label: string; color: string; icon: typeof Loader2 }> = {
  'input-streaming': { label: 'Running', color: 'text-primary', icon: Loader2 },
  'input-available': { label: 'Running', color: 'text-primary', icon: Loader2 },
  'approval-requested': { label: 'Awaiting', color: 'text-yellow-500', icon: Loader2 },
  'approval-responded': { label: 'Running', color: 'text-primary', icon: Loader2 },
  'output-available': { label: 'Done', color: 'text-green-500', icon: Check },
  'output-error': { label: 'Error', color: 'text-destructive', icon: AlertTriangle },
  'output-denied': { label: 'Denied', color: 'text-muted-foreground', icon: AlertTriangle },
};

function formatToolName(name: string): string {
  // Convert snake_case or camelCase to readable form
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function JsonPreview({ data, label }: { data: unknown; label: string }) {
  if (data === undefined || data === null) return null;

  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (!json || json === '{}' || json === 'undefined') return null;

  return (
    <div className="mt-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <pre className="mt-0.5 overflow-x-auto rounded bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
        {json}
      </pre>
    </div>
  );
}

export function ToolInvocationPart({
  toolName,
  state,
  input,
  output,
  errorText,
  title,
  className,
}: ToolInvocationPartProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = stateConfig[state] ?? stateConfig['input-available'];
  const StateIcon = config.icon;
  const isRunning =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  // Look up a custom renderer for this tool
  const CustomRenderer = toolResultRegistry.get(toolName);
  const hasCustomRenderer = Boolean(CustomRenderer);

  return (
    <div
      data-slot="tool-invocation-part"
      className={cn(
        'my-1 rounded-md border border-border/50 bg-muted/30 text-xs',
        state === 'output-error' && 'border-destructive/30',
        className
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-medium text-foreground/80">
          {title || formatToolName(toolName)}
        </span>
        <span className={cn('flex items-center gap-1', config.color)}>
          <StateIcon className={cn('size-3', isRunning && 'animate-spin')} />
          <span className="text-[10px]">{config.label}</span>
        </span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && (
        <div className="border-t border-border/50 px-2.5 py-2">
          <JsonPreview data={input} label="Input" />
          {state === 'output-available' && (
            <>
              {CustomRenderer ? (
                <div className="mt-1.5">
                  <CustomRenderer output={output} state={state} toolName={toolName} />
                </div>
              ) : (
                <JsonPreview data={output} label="Output" />
              )}
            </>
          )}
          {/* For loading states with a custom renderer, show the custom component inline */}
          {isRunning && CustomRenderer && (
            <div className="mt-1.5">
              <CustomRenderer output={output} state={state} toolName={toolName} />
            </div>
          )}
          {state === 'output-error' && errorText && (
            <div className="mt-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-destructive">
                Error
              </span>
              <pre className="mt-0.5 overflow-x-auto rounded bg-destructive/5 p-2 font-mono text-[11px] leading-relaxed text-destructive">
                {errorText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
