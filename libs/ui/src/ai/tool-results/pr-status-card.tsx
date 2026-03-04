/**
 * PRStatusCard — Renders check_pr_status and get_pr_feedback tool results.
 *
 * Shows PR number, state, CI checks, review status, and reviewers.
 */

import { Loader2, GitPullRequest, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface CheckInfo {
  name?: string;
  status?: string;
  conclusion?: string;
}

interface ReviewInfo {
  author?: string;
  state?: string;
  body?: string;
}

interface PRStatusData {
  // check_pr_status fields
  passedCount?: number;
  failedCount?: number;
  pendingCount?: number;
  checks?: CheckInfo[];
  // get_pr_feedback fields
  prNumber?: number;
  url?: string;
  state?: string;
  reviewDecision?: string;
  branch?: string;
  reviews?: ReviewInfo[];
  // shared
  success?: boolean;
  error?: string;
}

function extractData(output: unknown): PRStatusData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as PRStatusData;
  }
  return o as PRStatusData;
}

function CheckRow({ check }: { check: CheckInfo }) {
  const conclusion = (check.conclusion ?? check.status ?? '').toLowerCase();
  let Icon = Clock;
  let color = 'text-muted-foreground';

  if (conclusion === 'success' || conclusion === 'completed') {
    Icon = CheckCircle2;
    color = 'text-green-500';
  } else if (conclusion === 'failure' || conclusion === 'error' || conclusion === 'timed_out') {
    Icon = XCircle;
    color = 'text-red-500';
  } else if (conclusion === 'in_progress' || conclusion === 'queued' || conclusion === 'pending') {
    Icon = Loader2;
    color = 'text-blue-500';
  }

  return (
    <div className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted/40">
      <Icon
        className={cn('size-3 shrink-0', color, conclusion === 'in_progress' && 'animate-spin')}
      />
      <span className="min-w-0 flex-1 truncate text-foreground/80">{check.name ?? 'Check'}</span>
      <span className={cn('text-[10px]', color)}>{check.conclusion ?? check.status ?? ''}</span>
    </div>
  );
}

export function PRStatusCard({ output, state, toolName }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="pr-status-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>
          {toolName === 'get_pr_feedback' ? 'Fetching PR feedback…' : 'Checking PR status…'}
        </span>
      </div>
    );
  }

  const data = extractData(output);
  if (!data || data.error) {
    return (
      <div
        data-slot="pr-status-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        {data?.error ?? 'PR data unavailable'}
      </div>
    );
  }

  const hasChecks = data.passedCount != null || (data.checks && data.checks.length > 0);
  const hasReviews = data.reviews && data.reviews.length > 0;

  return (
    <div
      data-slot="pr-status-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <GitPullRequest className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">
          {data.prNumber ? `PR #${data.prNumber}` : 'PR Status'}
        </span>
        {data.branch && (
          <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {data.branch}
          </code>
        )}
        {data.state && (
          <span
            className={cn(
              'ml-auto rounded px-1.5 py-0.5 font-medium',
              data.state === 'MERGED'
                ? 'bg-purple-500/10 text-purple-500'
                : data.state === 'OPEN'
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-muted/60 text-muted-foreground'
            )}
          >
            {data.state}
          </span>
        )}
      </div>

      {/* Check summary badges */}
      {hasChecks && data.passedCount != null && (
        <div className="flex gap-1.5 border-b border-border/50 px-3 py-1.5">
          {data.passedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-1.5 py-0.5">
              <CheckCircle2 className="size-2.5 text-green-500" />
              <span className="font-semibold tabular-nums text-green-500">{data.passedCount}</span>
              <span className="text-[10px] text-muted-foreground">passed</span>
            </span>
          )}
          {(data.failedCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5">
              <XCircle className="size-2.5 text-red-500" />
              <span className="font-semibold tabular-nums text-red-500">{data.failedCount}</span>
              <span className="text-[10px] text-muted-foreground">failed</span>
            </span>
          )}
          {(data.pendingCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5">
              <Clock className="size-2.5 text-blue-500" />
              <span className="font-semibold tabular-nums text-blue-500">{data.pendingCount}</span>
              <span className="text-[10px] text-muted-foreground">pending</span>
            </span>
          )}
        </div>
      )}

      {/* Check details */}
      {data.checks && data.checks.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-b border-border/50 p-1.5">
          {data.checks.map((check, i) => (
            <CheckRow key={check.name ?? i} check={check} />
          ))}
        </div>
      )}

      {/* Reviews */}
      {hasReviews && (
        <div className="max-h-32 overflow-y-auto p-2">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Reviews
          </span>
          <div className="space-y-1">
            {data.reviews!.map((review, i) => (
              <div
                key={`${review.author}-${i}`}
                className="flex items-start gap-1.5 rounded px-1 py-0.5"
              >
                <span className="shrink-0 font-medium text-foreground/80">
                  {review.author ?? 'Unknown'}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1 py-0.5 text-[10px] font-medium',
                    review.state === 'APPROVED'
                      ? 'bg-green-500/10 text-green-500'
                      : review.state === 'CHANGES_REQUESTED'
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-muted/60 text-muted-foreground'
                  )}
                >
                  {review.state ?? 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review decision */}
      {data.reviewDecision && (
        <div className="border-t border-border/50 px-3 py-1 text-[10px] text-muted-foreground">
          Decision: {data.reviewDecision}
        </div>
      )}
    </div>
  );
}
