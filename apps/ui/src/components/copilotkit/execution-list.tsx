/**
 * Execution List for CopilotKit Sidebar
 *
 * Displays active workflow executions with their status.
 * Each execution has its own thread ID and state display.
 */

import { useState, useCallback } from 'react';
import { Play, Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

export interface WorkflowExecution {
  id: string;
  threadId: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

interface ExecutionListProps {
  executions: WorkflowExecution[];
  activeExecutionId?: string;
  onSelectExecution: (executionId: string) => void;
  onCancelExecution?: (executionId: string) => void;
}

function getStatusIcon(status: WorkflowExecution['status']) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case 'cancelled':
      return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function formatDuration(startMs: number, endMs?: number) {
  const elapsed = (endMs ?? Date.now()) - startMs;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function ExecutionList({
  executions,
  activeExecutionId,
  onSelectExecution,
}: ExecutionListProps) {
  const [collapsed, setCollapsed] = useState(false);

  const activeCount = executions.filter((e) => e.status === 'running').length;

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  if (executions.length === 0) return null;

  return (
    <div className="border-b border-border">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <Play className="w-3 h-3" />
        <span>Executions</span>
        {activeCount > 0 && (
          <span className="ml-auto px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full">
            {activeCount} active
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="px-2 pb-2 space-y-1">
          {executions.map((execution) => (
            <button
              key={execution.id}
              onClick={() => onSelectExecution(execution.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                execution.id === activeExecutionId
                  ? 'bg-primary/10 text-foreground'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {getStatusIcon(execution.status)}
              <span className="flex-1 truncate text-left">{execution.workflowName}</span>
              {execution.status === 'running' && (
                <span className="text-[10px] tabular-nums">{execution.progress}%</span>
              )}
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatDuration(execution.startedAt, execution.completedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
