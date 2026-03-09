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
import { ConfirmationCard } from './confirmation-card.js';
import { toolResultRegistry } from './tool-result-registry.js';
import { BoardSummaryCard } from './tool-results/board-summary-card.js';
import { FeatureListCard } from './tool-results/feature-list-card.js';
import { FeatureDetailCard } from './tool-results/feature-detail-card.js';
import { FeatureCreatedCard } from './tool-results/feature-created-card.js';
import { FeatureUpdatedCard, MoveFeatureCard } from './tool-results/feature-updated-card.js';
import { AgentStatusCard } from './tool-results/agent-status-card.js';
import { AgentOutputCard } from './tool-results/agent-output-card.js';
import { AutoModeStatusCard } from './tool-results/auto-mode-status-card.js';
import { ExecutionOrderCard } from './tool-results/execution-order-card.js';
import { ArtifactCard } from './tool-results/artifact-card.js';
import { ImageCard } from './tool-results/image-card.js';
import { WebPreviewCard } from './tool-results/web-preview-card.js';
import { PlanPartToolRenderer } from './plan-part.js';
import { DynamicAgentCard } from './tool-results/dynamic-agent-card.js';
import { MetricsCard } from './tool-results/metrics-card.js';
import { BriefingCard } from './tool-results/briefing-card.js';
import { PromotionCandidatesCard } from './tool-results/promotion-candidates-card.js';
import { PRStatusCard } from './tool-results/pr-status-card.js';
import { RunningAgentsCard } from './tool-results/running-agents-card.js';

// Register custom renderers for the boardRead tool group
toolResultRegistry.register('get_board_summary', BoardSummaryCard);
toolResultRegistry.register('list_features', FeatureListCard);
toolResultRegistry.register('get_feature', FeatureDetailCard);

// Register custom renderers for the boardWrite tool group
toolResultRegistry.register('create_feature', FeatureCreatedCard);
toolResultRegistry.register('update_feature', FeatureUpdatedCard);
toolResultRegistry.register('move_feature', MoveFeatureCard);

// Register custom renderers for the agentControl tool group
toolResultRegistry.register('start_agent', AgentStatusCard);
toolResultRegistry.register('stop_agent', AgentStatusCard);
toolResultRegistry.register('get_agent_output', AgentOutputCard);

// Register custom renderers for the autoMode tool group
toolResultRegistry.register('get_auto_mode_status', AutoModeStatusCard);

// Register custom renderers for the orchestration tool group
toolResultRegistry.register('get_execution_order', ExecutionOrderCard);

// Register custom renderers for artifact and image generation tools
toolResultRegistry.register('generate_artifact', ArtifactCard);
toolResultRegistry.register('generate_image', ImageCard);
toolResultRegistry.register('generate_html', WebPreviewCard);

// Register custom renderer for the planning tool
toolResultRegistry.register('create_plan', PlanPartToolRenderer);

// Register custom renderers for the agentDelegation tool group
toolResultRegistry.register('execute_dynamic_agent', DynamicAgentCard);

// Register custom renderers for the metrics tool group
toolResultRegistry.register('get_project_metrics', MetricsCard);
toolResultRegistry.register('get_capacity_metrics', MetricsCard);

// Register custom renderers for the briefing tool group
toolResultRegistry.register('get_briefing', BriefingCard);

// Register custom renderers for the promotion tool group
toolResultRegistry.register('list_staging_candidates', PromotionCandidatesCard);

// Register custom renderers for the prWorkflow tool group
toolResultRegistry.register('check_pr_status', PRStatusCard);
toolResultRegistry.register('get_pr_feedback', PRStatusCard);

// Register custom renderers for the agentControl tool group (running agents list)
toolResultRegistry.register('list_running_agents', RunningAgentsCard);

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
  /** Live progress label streamed via WebSocket during tool execution. */
  progressLabel?: string;
  /** Called when user approves a destructive tool call (HITL flow) */
  onApprove?: () => void;
  /** Called when user rejects a destructive tool call (HITL flow) */
  onReject?: () => void;
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

/** Convert snake_case or camelCase tool names to a human-readable form. */
export function formatToolName(name: string): string {
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
    <div className="mt-1.5 min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
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
  progressLabel,
  onApprove,
  onReject,
}: ToolInvocationPartProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = stateConfig[state] ?? stateConfig['input-available'];
  const StateIcon = config.icon;
  const isRunning =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  // ── HITL confirmation states — render ConfirmationCard inline ────────────
  if (state === 'approval-requested' || state === 'output-denied') {
    return (
      <ConfirmationCard
        toolName={toolName}
        input={input}
        state={state === 'output-denied' ? 'output-denied' : 'approval-requested'}
        onApprove={onApprove}
        onReject={onReject}
        className={className}
      />
    );
  }

  // Look up a custom renderer for this tool
  const CustomRenderer = toolResultRegistry.get(toolName);
  const hasCustomRenderer = Boolean(CustomRenderer);

  return (
    <div
      data-slot="tool-invocation-part"
      className={cn(
        'my-1 max-w-full overflow-hidden rounded-md border border-border/50 bg-muted/30 text-xs',
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
          <span className="max-w-[200px] truncate text-[10px]">
            {isRunning && progressLabel ? progressLabel : config.label}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && (
        <div className="min-w-0 border-t border-border/50 px-2.5 py-2">
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
              <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-destructive/5 p-2 font-mono text-[11px] leading-relaxed text-destructive">
                {errorText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
