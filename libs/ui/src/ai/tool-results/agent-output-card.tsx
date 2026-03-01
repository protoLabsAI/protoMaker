/**
 * AgentOutputCard — Formatted log preview for get_agent_output tool results.
 *
 * Renders:
 * - Formatted log preview (first N lines)
 * - File change summary (added / modified / deleted counts)
 */

import { Loader2, Terminal, FileText, FilePlus, FileX, FilePen } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface FileChange {
  path?: string;
  file?: string;
  type?: 'added' | 'modified' | 'deleted' | 'renamed' | string;
  status?: string;
  [key: string]: unknown;
}

interface AgentOutputData {
  output?: string;
  log?: string;
  logs?: string;
  content?: string;
  summary?: string;
  fileChanges?: FileChange[];
  files?: FileChange[];
  changedFiles?: FileChange[];
  filesAdded?: number;
  filesModified?: number;
  filesDeleted?: number;
  featureId?: string;
  featureTitle?: string;
  [key: string]: unknown;
}

function extractData(output: unknown): AgentOutputData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as AgentOutputData;
  }
  if (
    'output' in o ||
    'log' in o ||
    'logs' in o ||
    'fileChanges' in o ||
    'files' in o ||
    'content' in o
  ) {
    return o as AgentOutputData;
  }
  return o as AgentOutputData;
}

/** Get the raw log text from various field names */
function getLogText(data: AgentOutputData): string {
  const raw = data.output ?? data.log ?? data.logs ?? data.content ?? '';
  return typeof raw === 'string' ? raw : '';
}

/** Collect file changes from various shapes */
function getFileChanges(data: AgentOutputData): FileChange[] {
  if (Array.isArray(data.fileChanges) && data.fileChanges.length > 0) return data.fileChanges;
  if (Array.isArray(data.files) && data.files.length > 0) return data.files;
  if (Array.isArray(data.changedFiles) && data.changedFiles.length > 0) return data.changedFiles;
  return [];
}

/** Truncate log to N lines for preview */
function previewLines(text: string, maxLines = 12): { lines: string[]; truncated: boolean } {
  const all = text.split('\n');
  if (all.length <= maxLines) return { lines: all, truncated: false };
  return { lines: all.slice(0, maxLines), truncated: true };
}

function getChangeType(change: FileChange): 'added' | 'modified' | 'deleted' | 'other' {
  const t = (change.type ?? change.status ?? '').toLowerCase();
  if (t === 'added' || t === 'add' || t === 'new' || t === 'created') return 'added';
  if (t === 'deleted' || t === 'delete' || t === 'removed' || t === 'remove') return 'deleted';
  if (t === 'modified' || t === 'modify' || t === 'changed' || t === 'updated' || t === 'renamed')
    return 'modified';
  return 'other';
}

function FileChangeIcon({ type }: { type: ReturnType<typeof getChangeType> }) {
  if (type === 'added') return <FilePlus className="size-3 text-green-500" />;
  if (type === 'deleted') return <FileX className="size-3 text-red-500" />;
  if (type === 'modified') return <FilePen className="size-3 text-amber-500" />;
  return <FileText className="size-3 text-muted-foreground" />;
}

export function AgentOutputCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="agent-output-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading agent output…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data) {
    return (
      <div
        data-slot="agent-output-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        No agent output
      </div>
    );
  }

  const logText = getLogText(data);
  const fileChanges = getFileChanges(data);

  // Compute file change counts — prefer explicit counts
  const added = data.filesAdded ?? fileChanges.filter((f) => getChangeType(f) === 'added').length;
  const modified =
    data.filesModified ?? fileChanges.filter((f) => getChangeType(f) === 'modified').length;
  const deleted =
    data.filesDeleted ?? fileChanges.filter((f) => getChangeType(f) === 'deleted').length;

  const hasFileCounts = added > 0 || modified > 0 || deleted > 0 || fileChanges.length > 0;
  const hasLog = logText.trim().length > 0;

  const { lines, truncated } = hasLog
    ? previewLines(logText.trim())
    : { lines: [], truncated: false };

  return (
    <div
      data-slot="agent-output-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <Terminal className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Agent Output</span>
        {data.featureTitle && (
          <span className="ml-auto max-w-[160px] truncate text-muted-foreground">
            {data.featureTitle}
          </span>
        )}
      </div>

      {/* Summary line */}
      {data.summary && (
        <div className="border-b border-border/50 px-3 py-2 text-foreground/70">{data.summary}</div>
      )}

      {/* File change summary */}
      {hasFileCounts && (
        <div className="flex flex-wrap gap-2 border-b border-border/50 px-3 py-2">
          {added > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <FilePlus className="size-3" />
              {added} added
            </span>
          )}
          {modified > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <FilePen className="size-3" />
              {modified} modified
            </span>
          )}
          {deleted > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <FileX className="size-3" />
              {deleted} deleted
            </span>
          )}
          {/* Show individual files if list is short */}
          {fileChanges.length > 0 && fileChanges.length <= 6 && (
            <div className="mt-1 w-full space-y-0.5">
              {fileChanges.map((f, i) => {
                const type = getChangeType(f);
                const path = f.path ?? f.file ?? '';
                return (
                  <div
                    key={i}
                    className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"
                  >
                    <FileChangeIcon type={type} />
                    <span className="truncate">{path || '(unknown)'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Log preview */}
      {hasLog ? (
        <div
          className={cn(
            'max-h-48 overflow-y-auto px-3 py-2',
            'font-mono text-[10px] leading-relaxed text-foreground/70'
          )}
        >
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line || '\u00A0'}
            </div>
          ))}
          {truncated && <div className="mt-1 text-muted-foreground/60">… (truncated)</div>}
        </div>
      ) : (
        !hasFileCounts &&
        !data.summary && <div className="px-3 py-2 text-muted-foreground">No output recorded</div>
      )}
    </div>
  );
}
