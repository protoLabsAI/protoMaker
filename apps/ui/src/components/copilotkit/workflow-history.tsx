/**
 * Workflow History
 *
 * Shows recent workflow runs in the sidebar with name, status,
 * timestamp, and duration. Stored in localStorage, limited to 20 entries.
 */

import { useState, useCallback, useEffect } from 'react';
import { History, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';

const STORAGE_KEY = 'copilotkit-workflow-history';
const MAX_ENTRIES = 20;

export interface WorkflowHistoryEntry {
  id: string;
  workflowName: string;
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  threadId?: string;
}

function loadHistory(): WorkflowHistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as WorkflowHistoryEntry[];
    }
  } catch {
    // localStorage unavailable
  }
  return [];
}

function saveHistory(entries: WorkflowHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage unavailable
  }
}

function getStatusIcon(status: WorkflowHistoryEntry['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case 'cancelled':
      return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTimestamp(ms: number) {
  const date = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface WorkflowHistoryProps {
  onRestoreThread?: (threadId: string) => void;
}

export function WorkflowHistory({ onRestoreThread }: WorkflowHistoryProps) {
  const [entries, setEntries] = useState<WorkflowHistoryEntry[]>(loadHistory);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    saveHistory(entries);
  }, [entries]);

  const clearHistory = useCallback(() => {
    setEntries([]);
  }, []);

  const removeEntry = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  if (entries.length === 0) return null;

  const displayed = expanded ? entries : entries.slice(0, 5);

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <History className="w-3 h-3" />
          <span>Recent Runs</span>
          <span className="text-[10px]">({entries.length})</span>
        </div>
        {entries.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="px-2 pb-2 space-y-0.5">
        {displayed.map((entry) => (
          <button
            key={entry.id}
            onClick={() => entry.threadId && onRestoreThread?.(entry.threadId)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors group"
          >
            {getStatusIcon(entry.status)}
            <span className="flex-1 truncate text-left text-foreground">{entry.workflowName}</span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" />
              <span className="tabular-nums">{formatDuration(entry.durationMs)}</span>
              <span>{formatTimestamp(entry.completedAt)}</span>
            </div>
            <button
              onClick={(e) => removeEntry(entry.id, e)}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
            >
              <Trash2 className="w-3 h-3 text-destructive" />
            </button>
          </button>
        ))}

        {entries.length > 5 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? 'Show less' : `Show ${entries.length - 5} more`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to manage workflow history entries.
 * Call addEntry when a workflow completes to persist it.
 */
export function useWorkflowHistory() {
  const addEntry = useCallback((entry: WorkflowHistoryEntry) => {
    const current = loadHistory();
    const updated = [entry, ...current].slice(0, MAX_ENTRIES);
    saveHistory(updated);
  }, []);

  return { addEntry };
}
