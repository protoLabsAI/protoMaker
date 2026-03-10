import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@protolabsai/ui/atoms';
import { List, FileText, GitBranch, ClipboardList } from 'lucide-react';
import { Spinner } from '@protolabsai/ui/atoms';
import { getElectronAPI } from '@/lib/electron';
import { LogViewer } from '@/components/views/board-view/components/log-viewer';
import { GitDiffPanel } from '@/components/views/board-view/components/git-diff-panel';
import { TaskProgressPanel } from '@/components/views/board-view/components/task-progress-panel';
import { Markdown } from '@protolabsai/ui/molecules';
import { useWorktreeStore } from '@/store/worktree-store';
import { selectSummary } from '@/lib/summary-selection';
import { useAgentOutput } from '@/hooks/queries';
import type { AutoModeEvent } from '@/types/electron';

interface AgentOutputModalProps {
  open: boolean;
  onClose: () => void;
  featureDescription: string;
  featureId: string;
  /** The status of the feature - used to determine if spinner should be shown */
  featureStatus?: string;
  /** Called when a number key (0-9) is pressed while the modal is open */
  onNumberKeyPress?: (key: string) => void;
  /** Project path - if not provided, falls back to window.__currentProject for backward compatibility */
  projectPath?: string;
  /** Branch name for the feature worktree - used when viewing changes */
  branchName?: string;
  /** Server-side saved summary (preferred over client-extracted summary) */
  featureSummary?: string;
}

type ViewMode = 'summary' | 'parsed' | 'raw' | 'changes';

export function AgentOutputModal({
  open,
  onClose,
  featureDescription,
  featureId,
  featureStatus,
  onNumberKeyPress,
  projectPath: projectPathProp,
  branchName,
  featureSummary,
}: AgentOutputModalProps) {
  const isBacklogPlan = featureId.startsWith('backlog-plan:');

  // Resolve project path - prefer prop, fallback to window.__currentProject
  const resolvedProjectPath =
    projectPathProp ||
    (
      (window as unknown as Record<string, unknown>).__currentProject as
        | { path?: string }
        | undefined
    )?.path ||
    '';

  // Track additional content from WebSocket events (appended to query data)
  const [streamedContent, setStreamedContent] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);

  // Use React Query for initial output loading
  const { data: initialOutput = '', isLoading } = useAgentOutput(resolvedProjectPath, featureId, {
    enabled: open && !!resolvedProjectPath,
  });

  // Reset streamed content when modal opens or featureId changes
  useEffect(() => {
    if (open) {
      setStreamedContent('');
    }
  }, [open, featureId]);

  // Combine initial output from query with streamed content from WebSocket
  const output = initialOutput + streamedContent;

  // Prefer server-side saved summary; fall back to client-side extraction from output
  const summary = useMemo(() => selectSummary(featureSummary, output), [featureSummary, output]);

  // Determine the effective view mode - default to summary if available, otherwise parsed
  const effectiveViewMode = viewMode ?? (summary ? 'summary' : 'parsed');
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const useWorktrees = useWorktreeStore((state) => state.useWorktrees);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  // Listen to auto mode events and update output
  useEffect(() => {
    if (!open) return;

    const api = getElectronAPI();
    if (!api?.autoMode || isBacklogPlan) return;

    const unsubscribe = api.autoMode.onEvent((event) => {
      // Filter events for this specific feature only (skip events without featureId)
      if ('featureId' in event && event.featureId !== featureId) {
        return;
      }

      let newContent = '';

      switch (event.type) {
        case 'auto_mode_progress':
          newContent = event.content || '';
          break;
        case 'auto_mode_tool': {
          const toolName = event.tool || 'Unknown Tool';
          const toolInput = event.input ? JSON.stringify(event.input, null, 2) : '';
          newContent = `\n🔧 Tool: ${toolName}\n${toolInput ? `Input: ${toolInput}\n` : ''}`;
          break;
        }
        case 'auto_mode_phase': {
          const phaseEmoji =
            event.phase === 'planning' ? '📋' : event.phase === 'action' ? '⚡' : '✅';
          newContent = `\n${phaseEmoji} ${event.message}\n`;
          break;
        }
        case 'auto_mode_error':
          newContent = `\n❌ Error: ${event.error}\n`;
          break;
        case 'auto_mode_ultrathink_preparation': {
          // Format thinking level preparation information
          let prepContent = `\n🧠 Ultrathink Preparation\n`;

          if (event.warnings && event.warnings.length > 0) {
            prepContent += `\n⚠️ Warnings:\n`;
            event.warnings.forEach((warning: string) => {
              prepContent += `  • ${warning}\n`;
            });
          }

          if (event.recommendations && event.recommendations.length > 0) {
            prepContent += `\n💡 Recommendations:\n`;
            event.recommendations.forEach((rec: string) => {
              prepContent += `  • ${rec}\n`;
            });
          }

          if (event.estimatedCost !== undefined) {
            prepContent += `\n💰 Estimated Cost: ~$${event.estimatedCost.toFixed(
              2
            )} per execution\n`;
          }

          if (event.estimatedTime) {
            prepContent += `\n⏱️ Estimated Time: ${event.estimatedTime}\n`;
          }

          newContent = prepContent;
          break;
        }
        case 'planning_started': {
          // Show when planning mode begins
          if ('mode' in event && 'message' in event) {
            const modeLabel =
              event.mode === 'lite' ? 'Lite' : event.mode === 'spec' ? 'Spec' : 'Full';
            newContent = `\n📋 Planning Mode: ${modeLabel}\n${event.message}\n`;
          }
          break;
        }
        case 'plan_approval_required':
          // Show when plan requires approval
          if ('planningMode' in event) {
            newContent = `\n⏸️ Plan generated - waiting for your approval...\n`;
          }
          break;
        case 'plan_approved':
          // Show when plan is manually approved
          if ('hasEdits' in event) {
            newContent = event.hasEdits
              ? `\n✅ Plan approved (with edits) - continuing to implementation...\n`
              : `\n✅ Plan approved - continuing to implementation...\n`;
          }
          break;
        case 'plan_auto_approved':
          // Show when plan is auto-approved
          newContent = `\n✅ Plan auto-approved - continuing to implementation...\n`;
          break;
        case 'plan_revision_requested': {
          // Show when user requests plan revision
          if ('planVersion' in event) {
            const revisionEvent = event as Extract<
              AutoModeEvent,
              { type: 'plan_revision_requested' }
            >;
            newContent = `\n🔄 Revising plan based on your feedback (v${revisionEvent.planVersion})...\n`;
          }
          break;
        }
        case 'auto_mode_task_started': {
          // Show when a task starts
          if ('taskId' in event && 'taskDescription' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_started' }>;
            newContent = `\n▶ Starting ${taskEvent.taskId}: ${taskEvent.taskDescription}\n`;
          }
          break;
        }
        case 'auto_mode_task_complete': {
          // Show task completion progress
          if ('taskId' in event && 'tasksCompleted' in event && 'tasksTotal' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_complete' }>;
            newContent = `\n✓ ${taskEvent.taskId} completed (${taskEvent.tasksCompleted}/${taskEvent.tasksTotal})\n`;
          }
          break;
        }
        case 'auto_mode_phase_complete': {
          // Show phase completion for full mode
          if ('phaseNumber' in event) {
            const phaseEvent = event as Extract<
              AutoModeEvent,
              { type: 'auto_mode_phase_complete' }
            >;
            newContent = `\n🏁 Phase ${phaseEvent.phaseNumber} complete\n`;
          }
          break;
        }
        case 'auto_mode_feature_complete': {
          const emoji = event.passes ? '✅' : '⚠️';
          newContent = `\n${emoji} Task completed: ${event.message}\n`;

          // Close the modal when the feature is verified (passes = true)
          if (event.passes) {
            // Small delay to show the completion message before closing
            setTimeout(() => {
              onClose();
            }, 1500);
          }
          break;
        }
      }

      if (newContent) {
        // Append new content from WebSocket to streamed content
        setStreamedContent((prev) => prev + newContent);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [open, featureId, isBacklogPlan]);

  // Listen to backlog plan events and update output
  useEffect(() => {
    if (!open || !isBacklogPlan) return;

    const api = getElectronAPI();
    if (!api?.backlogPlan) return;

    const unsubscribe = api.backlogPlan.onEvent((event: unknown) => {
      const e = event as Record<string, unknown> | null;
      if (!e?.type) return;

      let newContent = '';
      switch (e.type) {
        case 'backlog_plan_progress':
          newContent = `\n🧭 ${(e.content as string) || 'Backlog plan progress update'}\n`;
          break;
        case 'backlog_plan_error':
          newContent = `\n❌ Backlog plan error: ${(e.error as string) || 'Unknown error'}\n`;
          break;
        case 'backlog_plan_complete':
          newContent = `\n✅ Backlog plan completed\n`;
          break;
        default:
          newContent = `\nℹ️ ${e.type}\n`;
          break;
      }

      if (newContent) {
        setStreamedContent((prev) => `${prev}${newContent}`);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [open, isBacklogPlan]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  // Handle number key presses while modal is open
  useEffect(() => {
    if (!open || !onNumberKeyPress) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if a number key (0-9) was pressed without modifiers
      if (!event.ctrlKey && !event.altKey && !event.metaKey && /^[0-9]$/.test(event.key)) {
        event.preventDefault();
        onNumberKeyPress(event.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onNumberKeyPress]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-full h-full max-w-full max-h-full sm:w-[60vw] sm:max-w-[60vw] sm:max-h-[80vh] sm:h-auto sm:rounded-xl rounded-none flex flex-col"
        data-testid="agent-output-modal"
      >
        <DialogHeader className="shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2">
              {featureStatus !== 'verified' && featureStatus !== 'waiting_approval' && (
                <Spinner size="md" />
              )}
              Agent Output
            </DialogTitle>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
              {summary && (
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    effectiveViewMode === 'summary'
                      ? 'bg-primary/20 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  data-testid="view-mode-summary"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Summary
                </button>
              )}
              <button
                onClick={() => setViewMode('parsed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  effectiveViewMode === 'parsed'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-parsed"
              >
                <List className="w-3.5 h-3.5" />
                Logs
              </button>
              <button
                onClick={() => setViewMode('changes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  effectiveViewMode === 'changes'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-changes"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Changes
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  effectiveViewMode === 'raw'
                    ? 'bg-primary/20 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                data-testid="view-mode-raw"
              >
                <FileText className="w-3.5 h-3.5" />
                Raw
              </button>
            </div>
          </div>
          <DialogDescription
            className="mt-1 max-h-24 overflow-y-auto wrap-break-word"
            data-testid="agent-output-description"
          >
            {featureDescription}
          </DialogDescription>
        </DialogHeader>

        {/* Task Progress Panel - shows when tasks are being executed */}
        {!isBacklogPlan && (
          <TaskProgressPanel
            featureId={featureId}
            projectPath={resolvedProjectPath}
            className="shrink-0 mx-3 my-2"
          />
        )}

        {effectiveViewMode === 'changes' ? (
          <div className="flex-1 min-h-0 sm:min-h-[200px] sm:max-h-[60vh] overflow-y-auto scrollbar-visible">
            {resolvedProjectPath ? (
              <GitDiffPanel
                projectPath={resolvedProjectPath}
                featureId={branchName || featureId}
                compact={false}
                useWorktrees={useWorktrees}
                className="border-0 rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Spinner size="lg" className="mr-2" />
                Loading...
              </div>
            )}
          </div>
        ) : effectiveViewMode === 'summary' && summary ? (
          <div className="flex-1 min-h-0 sm:min-h-[200px] sm:max-h-[60vh] overflow-y-auto bg-card border border-border/50 rounded-lg p-4 scrollbar-visible">
            <Markdown>{summary}</Markdown>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 min-h-0 sm:min-h-[200px] sm:max-h-[60vh] overflow-y-auto bg-popover border border-border/50 rounded-lg p-4 font-mono text-xs scrollbar-visible"
            >
              {isLoading && !output ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Spinner size="lg" className="mr-2" />
                  Loading output...
                </div>
              ) : !output ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No output yet. The agent will stream output here as it works.
                </div>
              ) : effectiveViewMode === 'parsed' ? (
                <LogViewer output={output} />
              ) : (
                <div className="whitespace-pre-wrap wrap-break-word text-foreground/80">
                  {output}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-center shrink-0">
              {autoScrollRef.current
                ? 'Auto-scrolling enabled'
                : 'Scroll to bottom to enable auto-scroll'}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
