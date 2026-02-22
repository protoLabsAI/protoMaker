import { memo, useMemo, useState } from 'react';
import { Feature } from '@/store/types';
import { useAgentOutput } from '@/hooks/queries';
import { ChevronDown, ChevronRight, FileCode, Activity, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatModelName,
  extractActivityLog,
  extractFilesChanged,
  extractAgentState,
} from '@/lib/agent-context-parser';

interface AgentInspectorProps {
  feature: Feature;
  projectPath: string;
  isCurrentAutoTask?: boolean;
}

export const AgentInspector = memo(function AgentInspector({
  feature,
  projectPath,
  isCurrentAutoTask,
}: AgentInspectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'activity' | 'files' | 'state'>('activity');

  // Only show for in_progress features or features with agent output
  const shouldShow =
    feature.status === 'in_progress' || feature.status === 'review' || feature.status === 'done';

  // Determine if we should poll for updates
  const shouldPoll = isCurrentAutoTask || feature.status === 'in_progress';

  // Fetch agent output
  const { data: agentOutput } = useAgentOutput(projectPath, feature.id, {
    enabled: shouldShow,
    pollingInterval: shouldPoll ? 3000 : false,
  });

  // Parse activity log (memoized to avoid re-parsing on every render)
  const activityLog = useMemo(() => {
    if (!agentOutput) return [];
    return extractActivityLog(agentOutput);
  }, [agentOutput]);

  // Parse files changed (memoized)
  const filesChanged = useMemo(() => {
    if (!agentOutput) return [];
    return extractFilesChanged(agentOutput);
  }, [agentOutput]);

  // Parse agent state (memoized)
  const agentState = useMemo(() => {
    if (!agentOutput) return { turns: undefined, cost: undefined, duration: undefined };
    return extractAgentState(agentOutput);
  }, [agentOutput]);

  // Don't render if no agent output
  if (!shouldShow || !agentOutput || agentOutput.trim().length === 0) {
    return null;
  }

  return (
    <div className="mb-3 border-t border-border/30 pt-2">
      {/* Collapsible header */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full flex items-center justify-between gap-2 px-0 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0" />
          )}
          <Activity className="w-3 h-3 shrink-0" />
          <span className="font-medium">Agent Inspector</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {activityLog.length > 0 && (
            <span className="text-muted-foreground/60">{activityLog.length} actions</span>
          )}
          {filesChanged.length > 0 && (
            <span className="text-muted-foreground/60">{filesChanged.length} files</span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {/* Tabs */}
          <div className="flex items-center gap-1 text-[10px] border-b border-border/20 pb-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab('activity');
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                'px-2 py-1 rounded-md transition-colors',
                activeTab === 'activity'
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Activity
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab('files');
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                'px-2 py-1 rounded-md transition-colors',
                activeTab === 'files'
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Files
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab('state');
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                'px-2 py-1 rounded-md transition-colors',
                activeTab === 'state'
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              State
            </button>
          </div>

          {/* Activity Log Tab */}
          {activeTab === 'activity' && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {activityLog.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/60 italic">No activities yet</p>
              ) : (
                activityLog.slice(0, 50).map((activity, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-1.5 text-[10px] text-muted-foreground/80 break-words"
                  >
                    <span className="text-muted-foreground/40 font-mono shrink-0 mt-0.5">
                      {idx + 1}.
                    </span>
                    <span className="break-all leading-relaxed">{activity.description}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Files Changed Tab */}
          {activeTab === 'files' && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {filesChanged.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/60 italic">No files modified yet</p>
              ) : (
                filesChanged.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 break-all"
                  >
                    <FileCode className="w-2.5 h-2.5 shrink-0 text-muted-foreground/40" />
                    <span className="font-mono break-all leading-relaxed">{file}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Agent State Tab */}
          {activeTab === 'state' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground/60">Model:</span>
                <span className="text-foreground font-medium">
                  {formatModelName((feature.model as string) ?? 'claude-sonnet-4-5-20250929')}
                </span>
              </div>

              {agentState.turns !== undefined && (
                <div className="flex items-center gap-2 text-[10px]">
                  <Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
                  <span className="text-muted-foreground/60">Turns:</span>
                  <span className="text-foreground">{agentState.turns}</span>
                </div>
              )}

              {agentState.cost !== undefined && (
                <div className="flex items-center gap-2 text-[10px]">
                  <DollarSign className="w-2.5 h-2.5 text-muted-foreground/40" />
                  <span className="text-muted-foreground/60">Cost:</span>
                  <span className="text-foreground">${agentState.cost.toFixed(2)}</span>
                </div>
              )}

              {agentState.duration !== undefined && (
                <div className="flex items-center gap-2 text-[10px]">
                  <Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
                  <span className="text-muted-foreground/60">Duration:</span>
                  <span className="text-foreground">{agentState.duration}</span>
                </div>
              )}

              {!agentState.turns && !agentState.cost && !agentState.duration && (
                <p className="text-[10px] text-muted-foreground/60 italic">
                  State information not available
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
