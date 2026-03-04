/**
 * PromotionCandidatesCard — Renders list_staging_candidates tool results.
 *
 * Shows unmerged commits from dev to staging as a compact list.
 */

import { Loader2, GitBranch } from 'lucide-react';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface CommitEntry {
  hash?: string;
  message?: string;
}

interface PromotionData {
  count?: number;
  commits?: CommitEntry[];
  error?: string;
}

function extractData(output: unknown): PromotionData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as PromotionData;
  }
  return o as PromotionData;
}

export function PromotionCandidatesCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="promotion-candidates-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Checking staging candidates…</span>
      </div>
    );
  }

  const data = extractData(output);
  if (!data || data.error) {
    return (
      <div
        data-slot="promotion-candidates-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        {data?.error ?? 'No promotion data available'}
      </div>
    );
  }

  const commits = data.commits ?? [];
  const count = data.count ?? commits.length;

  return (
    <div
      data-slot="promotion-candidates-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <GitBranch className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Staging Candidates</span>
        <span className="ml-auto text-muted-foreground">
          {count} commit{count !== 1 ? 's' : ''} ahead
        </span>
      </div>

      {/* Commit list */}
      <div className="max-h-40 overflow-y-auto p-2">
        {commits.length === 0 ? (
          <div className="px-1 py-2 text-center text-muted-foreground">
            dev and staging are in sync
          </div>
        ) : (
          <div className="space-y-0.5">
            {commits.slice(0, 20).map((commit, i) => (
              <div
                key={commit.hash ?? i}
                className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40"
              >
                <code className="shrink-0 text-[10px] text-primary/70">
                  {commit.hash?.slice(0, 7) ?? '???????'}
                </code>
                <span className="min-w-0 flex-1 truncate text-foreground/80">
                  {commit.message ?? '(no message)'}
                </span>
              </div>
            ))}
            {commits.length > 20 && (
              <div className="px-1.5 py-1 text-center text-muted-foreground">
                +{commits.length - 20} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
