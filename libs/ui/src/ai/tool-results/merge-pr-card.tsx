/**
 * MergePRCard — Renders merge_pr tool results.
 *
 * Shows PR number, title, merge status (success/failed), target branch, and merge commit hash.
 */

import { Loader2, GitMerge, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface MergePRData {
  prNumber?: number;
  title?: string;
  merged?: boolean;
  mergeCommitSha?: string;
  targetBranch?: string;
  error?: string;
  message?: string;
}

function extractData(output: unknown): MergePRData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as MergePRData;
  }
  return o as MergePRData;
}

export function MergePRCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="merge-pr-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Merging PR…</span>
      </div>
    );
  }

  const data = extractData(output);
  if (!data || data.error) {
    return (
      <div
        data-slot="merge-pr-card"
        className="rounded-md border border-destructive/30 bg-muted/30 px-3 py-2 text-xs text-destructive"
      >
        <div className="flex items-center gap-1.5">
          <XCircle className="size-3.5 shrink-0" />
          <span>{data?.error ?? 'Merge failed'}</span>
        </div>
      </div>
    );
  }

  const merged = data.merged ?? false;

  return (
    <div
      data-slot="merge-pr-card"
      className={cn(
        'rounded-md border bg-muted/30 text-xs',
        merged ? 'border-border/50' : 'border-destructive/30'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <GitMerge
          className={cn('size-3.5 shrink-0', merged ? 'text-purple-500' : 'text-destructive')}
        />
        <span className="font-medium text-foreground/80">
          {data.prNumber ? `PR #${data.prNumber}` : 'Merge PR'}
        </span>
        <span
          className={cn(
            'ml-auto rounded px-1.5 py-0.5 font-medium',
            merged ? 'bg-purple-500/10 text-purple-500' : 'bg-destructive/10 text-destructive'
          )}
        >
          {merged ? 'Merged' : 'Failed'}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1 px-3 py-2">
        {data.title && (
          <div className="flex items-start gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Title
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground/80">{data.title}</span>
          </div>
        )}
        {data.targetBranch && (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Target
            </span>
            <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {data.targetBranch}
            </code>
          </div>
        )}
        {merged && data.mergeCommitSha && (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Commit
            </span>
            <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-primary/70">
              {data.mergeCommitSha.slice(0, 7)}
            </code>
          </div>
        )}
        {!merged && data.message && (
          <div className="flex items-start gap-1.5">
            <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
            <span className="text-destructive">{data.message}</span>
          </div>
        )}
        {merged && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <CheckCircle2 className="size-3 shrink-0 text-green-500" />
            <span className="text-green-500">PR merged successfully</span>
          </div>
        )}
      </div>
    </div>
  );
}
