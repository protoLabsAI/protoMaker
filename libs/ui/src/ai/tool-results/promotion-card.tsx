/**
 * PromotionCard — Renders promote_to_staging tool results.
 *
 * Shows promotion status, source/target branches, commit count, and any conflicts.
 */

import { Loader2, GitBranch, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface ConflictInfo {
  file?: string;
  type?: string;
}

interface PromotionResultData {
  success?: boolean;
  sourceBranch?: string;
  targetBranch?: string;
  commitCount?: number;
  conflicts?: ConflictInfo[];
  error?: string;
  message?: string;
}

function extractData(output: unknown): PromotionResultData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as PromotionResultData;
  }
  return o as PromotionResultData;
}

export function PromotionCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="promotion-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Promoting to staging…</span>
      </div>
    );
  }

  const data = extractData(output);
  if (!data || data.error) {
    return (
      <div
        data-slot="promotion-card"
        className="rounded-md border border-destructive/30 bg-muted/30 px-3 py-2 text-xs text-destructive"
      >
        <div className="flex items-center gap-1.5">
          <XCircle className="size-3.5 shrink-0" />
          <span>{data?.error ?? 'Promotion failed'}</span>
        </div>
      </div>
    );
  }

  const succeeded = data.success ?? false;
  const hasConflicts = data.conflicts && data.conflicts.length > 0;

  return (
    <div
      data-slot="promotion-card"
      className={cn(
        'rounded-md border bg-muted/30 text-xs',
        succeeded ? 'border-border/50' : 'border-destructive/30'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <GitBranch
          className={cn('size-3.5 shrink-0', succeeded ? 'text-green-500' : 'text-destructive')}
        />
        <span className="font-medium text-foreground/80">Promote to Staging</span>
        <span
          className={cn(
            'ml-auto rounded px-1.5 py-0.5 font-medium',
            succeeded
              ? 'bg-green-500/10 text-green-500'
              : hasConflicts
                ? 'bg-yellow-500/10 text-yellow-500'
                : 'bg-destructive/10 text-destructive'
          )}
        >
          {succeeded ? 'Success' : hasConflicts ? 'Conflicts' : 'Failed'}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1 px-3 py-2">
        {(data.sourceBranch || data.targetBranch) && (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Branches
            </span>
            {data.sourceBranch && (
              <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {data.sourceBranch}
              </code>
            )}
            {data.sourceBranch && data.targetBranch && (
              <span className="text-muted-foreground">→</span>
            )}
            {data.targetBranch && (
              <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {data.targetBranch}
              </code>
            )}
          </div>
        )}
        {data.commitCount != null && (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Commits
            </span>
            <span className="font-semibold tabular-nums text-foreground/80">
              {data.commitCount}
            </span>
            <span className="text-muted-foreground">
              commit{data.commitCount !== 1 ? 's' : ''} promoted
            </span>
          </div>
        )}
        {succeeded && !hasConflicts && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <CheckCircle2 className="size-3 shrink-0 text-green-500" />
            <span className="text-green-500">Promotion completed successfully</span>
          </div>
        )}
        {data.message && !succeeded && (
          <div className="flex items-start gap-1.5">
            <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
            <span className="text-destructive">{data.message}</span>
          </div>
        )}
      </div>

      {/* Conflicts */}
      {hasConflicts && (
        <div className="border-t border-border/50 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <AlertTriangle className="size-3 text-yellow-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-yellow-500">
              Conflicts
            </span>
          </div>
          <div className="max-h-24 space-y-0.5 overflow-y-auto">
            {data.conflicts!.map((conflict, i) => (
              <div
                key={conflict.file ?? i}
                className="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/80">
                  {conflict.file ?? 'Unknown file'}
                </span>
                {conflict.type && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {conflict.type}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
