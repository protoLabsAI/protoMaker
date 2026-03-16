/**
 * PlanPart — Expandable card displaying a structured execution plan with step tracking.
 *
 * Renders a collapsible card with:
 *  - Header showing the plan title and an overall status badge (pending/running/done)
 *  - Step list where each step shows a status icon and title
 *  - Optional collapsible detail per step
 *
 * Auto-expands when plan status transitions to 'running'.
 * Auto-collapses when plan status transitions to 'done'.
 *
 * Also exported as PlanPartToolRenderer for registration as a ToolResultRenderer
 * for the 'create_plan' tool.
 */

import { useState, useEffect } from 'react';
import { Clock, Loader2, Check, X, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.js';
import type { ToolResultRendererProps } from './tool-result-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'error';

export interface PlanStep {
  id: string;
  title: string;
  status: PlanStepStatus;
  detail?: string;
}

export type PlanStatus = 'pending' | 'running' | 'done';

export interface PlanData {
  title: string;
  status: PlanStatus;
  steps: PlanStep[];
}

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const statusBadgeConfig: Record<PlanStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-muted text-muted-foreground' },
  running: { label: 'Running', className: 'bg-primary/20 text-primary' },
  done: { label: 'Done', className: 'bg-green-500/20 text-green-600 dark:text-green-400' },
};

// ---------------------------------------------------------------------------
// StepIcon
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: PlanStepStatus }) {
  switch (status) {
    case 'pending':
      return <Clock className="size-3.5 shrink-0 text-muted-foreground" />;
    case 'running':
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
    case 'done':
      return <Check className="size-3.5 shrink-0 text-green-500" />;
    case 'error':
      return <X className="size-3.5 shrink-0 text-destructive" />;
    default:
      return <Clock className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// PlanStepRow
// ---------------------------------------------------------------------------

function PlanStepRow({ step }: { step: PlanStep }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const hasDetail = Boolean(step.detail);

  return (
    <div data-slot="plan-step" className="py-1">
      <div className="flex items-center gap-2">
        <StepIcon status={step.status} />
        <span
          className={cn(
            'flex-1 text-[11px]',
            step.status === 'done' && 'text-muted-foreground line-through',
            step.status === 'error' && 'text-destructive',
            step.status === 'running' && 'font-medium text-foreground',
            step.status === 'pending' && 'text-foreground/80'
          )}
        >
          {step.title}
        </span>
        {hasDetail && (
          <button
            type="button"
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-muted/50"
            onClick={() => setDetailOpen(!detailOpen)}
            aria-expanded={detailOpen}
            aria-label={detailOpen ? 'Hide step detail' : 'Show step detail'}
          >
            <ChevronDown
              className={cn(
                'size-3 text-muted-foreground transition-transform',
                detailOpen && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>
      {hasDetail && detailOpen && (
        <p className="mt-1 pl-5 text-[10px] leading-relaxed text-muted-foreground/80">
          {step.detail}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanPart (primary component)
// ---------------------------------------------------------------------------

export interface PlanPartProps {
  plan: PlanData;
  className?: string;
}

export function PlanPart({ plan, className }: PlanPartProps) {
  // Start expanded if running, collapsed otherwise
  const [isOpen, setIsOpen] = useState(plan.status === 'running');

  // Auto-expand when running, auto-collapse when done
  useEffect(() => {
    if (plan.status === 'running') {
      setIsOpen(true);
    } else if (plan.status === 'done') {
      setIsOpen(false);
    }
  }, [plan.status]);

  const badge = statusBadgeConfig[plan.status] ?? statusBadgeConfig.pending;

  return (
    <div
      data-slot="plan-part"
      className={cn('my-1 rounded-md border border-border/50 bg-muted/30 text-xs', className)}
    >
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="flex-1 truncate font-medium text-foreground/80">{plan.title}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', badge.className)}>
          {badge.label}
        </span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Step list */}
      {isOpen && plan.steps.length > 0 && (
        <div className="divide-y divide-border/30 border-t border-border/50 px-2.5 py-1">
          {plan.steps.map((step) => (
            <PlanStepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: extract PlanData from tool output (handles ToolResult envelope)
// ---------------------------------------------------------------------------

export function extractPlanData(output: unknown): PlanData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;

  // Unwrap ToolResult envelope: { success: true, data: { ... } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return extractPlanData(o.data);
  }

  // Direct PlanData shape: { title, status, steps }
  if (
    'title' in o &&
    typeof o.title === 'string' &&
    'status' in o &&
    typeof o.status === 'string' &&
    'steps' in o &&
    Array.isArray(o.steps)
  ) {
    return o as unknown as PlanData;
  }

  return null;
}

// ---------------------------------------------------------------------------
// PlanPartToolRenderer — ToolResultRenderer for 'create_plan' tool
// ---------------------------------------------------------------------------

export function PlanPartToolRenderer({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="plan-part-loading"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Planning…</span>
      </div>
    );
  }

  const plan = extractPlanData(output);
  if (!plan) return null;

  return <PlanPart plan={plan} />;
}
