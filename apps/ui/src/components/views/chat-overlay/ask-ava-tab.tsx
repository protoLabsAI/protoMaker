/**
 * AskAvaTab — the human<>Ava chat tab for the overlay and modal.
 *
 * Extracted from ChatOverlayContent to support a two-tab layout.
 * Contains: queue panel, conversation history panel, settings panel, chat area.
 */

import { useCallback, useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import {
  ChatMessageList,
  ChatInput,
  SuggestionList,
  PromptInputProvider,
  QueueView,
  usePromptInput,
  type BranchInfo,
  type UseSlashCommandsResult,
  type SlashCommand,
} from '@protolabsai/ui/ai';
import { cn } from '@/lib/utils';
import { ChatModelSelect } from '@/components/views/chat/components/chat-model-select';
// Side-effect import: registers AskUserFormCard in the tool-result-registry
import '@/components/views/chat-overlay/inline-form-card';
import { ConversationList } from './conversation-list';
import { AvaSettingsPanel } from './ava-settings-panel';
import type { ChatSession } from '@/store/chat-store';
import type { SuggestionItem } from '@protolabsai/ui/ai';
import type { PendingSubagentApproval } from '@/hooks/use-chat-session';
import { useSlashCommands } from '@/hooks/use-slash-commands';

/** Displays a live "Waiting Xs" counter from a receivedAt ISO timestamp. */
function WaitingTimer({ receivedAt }: { receivedAt: string }) {
  const [seconds, setSeconds] = useState(() =>
    Math.floor((Date.now() - new Date(receivedAt).getTime()) / 1000)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - new Date(receivedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [receivedAt]);
  return <span className="text-xs text-status-warning/80">Waiting {seconds}s</span>;
}

/**
 * Inner component that lives inside PromptInputProvider so it can read the
 * current input value and wire it into useSlashCommands.
 */
function ChatInputWithSlashCommands({
  onSubmit,
  onStop,
  isStreaming,
  modelAlias,
  tokenUsage,
  shortcutHint,
  onModelChange,
}: {
  onSubmit: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  modelAlias: string;
  tokenUsage: { total: number; input: number; output: number; estimated: boolean };
  shortcutHint: string;
  onModelChange: (alias: string) => void;
}) {
  const { value, setValue } = usePromptInput();
  const hookResult = useSlashCommands(value);

  // Build the navigate handler: moves selectedIndex up/down with wrap-around.
  const navigate = useCallback(
    (direction: 'up' | 'down') => {
      const count = hookResult.commands.length;
      if (count === 0) return;
      hookResult.select(
        direction === 'up'
          ? (hookResult.selectedIndex - 1 + count) % count
          : (hookResult.selectedIndex + 1) % count
      );
    },
    [hookResult]
  );

  // Build the close handler: reset selection index (isActive derives from input value).
  const close = useCallback(() => {
    hookResult.select(-1);
  }, [hookResult]);

  // Build the select handler: inserts the selected command name into the input,
  // leaving a trailing space so the user can type arguments immediately.
  const handleSelect = useCallback(
    (cmd: SlashCommand) => {
      setValue(`/${cmd.name} `);
      hookResult.select(-1);
    },
    [setValue, hookResult]
  );

  // Normalise selectedIndex: clamp to 0 when active and no explicit selection.
  const normalizedIndex =
    hookResult.isActive && hookResult.selectedIndex === -1 ? 0 : hookResult.selectedIndex;

  const slashCommands: UseSlashCommandsResult = {
    isActive: hookResult.isActive,
    commands: hookResult.commands.map((c) => ({
      name: c.name,
      description: c.description,
      source: c.source,
      argHint: c.argumentHint,
    })),
    selectedIndex: normalizedIndex,
    onSelect: handleSelect,
    onClose: close,
    onNavigate: navigate,
  };

  return (
    <ChatInput
      onSubmit={onSubmit}
      onStop={onStop}
      isStreaming={isStreaming}
      placeholder="Ask Ava..."
      autoFocus
      slashCommands={slashCommands}
      actions={
        <>
          <ChatModelSelect value={modelAlias} onValueChange={onModelChange} />
          {tokenUsage.total > 0 && (
            <span
              className={cn(
                'text-xs tabular-nums',
                tokenUsage.total > 100_000
                  ? 'text-destructive font-medium'
                  : tokenUsage.total > 50_000
                    ? 'text-status-warning'
                    : 'text-muted-foreground'
              )}
              title={
                tokenUsage.estimated
                  ? `~${tokenUsage.total.toLocaleString()} estimated context size`
                  : `Context: ${tokenUsage.input.toLocaleString()} tokens (last response: ${tokenUsage.output.toLocaleString()} output)`
              }
            >
              {tokenUsage.estimated && '~'}
              {tokenUsage.total >= 1000
                ? `${(tokenUsage.total / 1000).toFixed(1)}k`
                : tokenUsage.total}{' '}
              tokens
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {isStreaming ? 'Streaming...' : `Enter to send \u00B7 ${shortcutHint}`}
          </span>
        </>
      }
    />
  );
}

export interface AskAvaTabProps {
  displayedMessages: UIMessage[];
  isStreaming: boolean;
  suggestions: SuggestionItem[];
  sessions: ChatSession[];
  currentSessionId: string | null;
  modelAlias: string;
  tokenUsage: {
    total: number;
    input: number;
    output: number;
    estimated: boolean;
  };
  branchInfoMap: Map<string, BranchInfo>;
  /** The origId of the message currently being regenerated, or null if none. */
  pendingBranchOrigId?: string | null;
  settingsOpen: boolean;
  historyOpen: boolean;
  queueOpen: boolean;
  queuePaused: boolean;
  projectPath?: string;
  shortcutHint: string;

  onSubmit: (text: string) => void;
  onStop: () => void;
  onSuggestionSelect: (value: string) => void;
  onRegenerate: () => void;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onToolApprove: (toolCallId: string) => void;
  onToolReject: (toolCallId: string) => void;
  onPreviousBranch: (origId: string) => void;
  onNextBranch: (origId: string) => void;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onCloseHistory: () => void;
  onToggleQueuePause: () => void;
  onModelChange: (alias: string) => void;
  getToolProgressLabel: (toolCallId: string) => string | undefined;

  /** Pending subagent tool approval requests */
  pendingSubagentApprovals: PendingSubagentApproval[];
  approveSubagentTool: (approvalId: string) => void;
  denySubagentTool: (approvalId: string) => void;
}

export function AskAvaTab({
  displayedMessages,
  isStreaming,
  suggestions,
  sessions,
  currentSessionId,
  modelAlias,
  tokenUsage,
  branchInfoMap,
  pendingBranchOrigId,
  settingsOpen,
  historyOpen,
  queueOpen,
  queuePaused,
  projectPath,
  shortcutHint,
  onSubmit,
  onStop,
  onSuggestionSelect,
  onRegenerate,
  onThumbsUp,
  onThumbsDown,
  onToolApprove,
  onToolReject,
  onPreviousBranch,
  onNextBranch,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onCloseHistory,
  onToggleQueuePause,
  onModelChange,
  getToolProgressLabel,
  pendingSubagentApprovals,
  approveSubagentTool,
  denySubagentTool,
}: AskAvaTabProps) {
  return (
    <div className="flex min-h-0 flex-1">
      {/* Queue panel — slide in from left */}
      {queueOpen && (
        <div className="w-56 shrink-0 border-r border-border overflow-y-auto p-2 animate-in slide-in-from-left duration-200">
          <QueueView items={[]} paused={queuePaused} onTogglePause={onToggleQueuePause} />
        </div>
      )}

      {/* Conversation list panel — slide in from left */}
      {historyOpen && (
        <ConversationList
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={(id) => {
            onSelectSession(id);
            onCloseHistory();
          }}
          onNew={() => {
            onNewChat();
            onCloseHistory();
          }}
          onDelete={onDeleteSession}
          onClose={onCloseHistory}
          className="animate-in slide-in-from-left duration-200"
        />
      )}

      {/* Settings panel — slides in from right, replaces chat area */}
      {settingsOpen && (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
          <AvaSettingsPanel projectPath={projectPath} />
        </div>
      )}

      {/* Chat area — hidden when settings is open */}
      <div className={cn('flex min-w-0 flex-1 flex-col', settingsOpen && 'hidden')}>
        <ChatMessageList
          messages={displayedMessages}
          emptyMessage="Ask Ava anything..."
          isStreaming={isStreaming}
          onRegenerate={onRegenerate}
          onThumbsUp={onThumbsUp}
          onThumbsDown={onThumbsDown}
          onToolApprove={onToolApprove}
          onToolReject={onToolReject}
          branchInfoMap={branchInfoMap}
          pendingBranchOrigId={pendingBranchOrigId}
          onPreviousBranch={onPreviousBranch}
          onNextBranch={onNextBranch}
          getToolProgressLabel={getToolProgressLabel}
        />

        {/* Contextual suggestions — shown only when no messages in current session */}
        {displayedMessages.length === 0 && (
          <SuggestionList suggestions={suggestions} onSelect={onSuggestionSelect} />
        )}

        {/* Subagent tool approval cards — rendered above the chat input */}
        {pendingSubagentApprovals.length > 0 && (
          <div className="flex flex-col gap-2 px-3 pt-2">
            {pendingSubagentApprovals.map((approval) => {
              const preview = JSON.stringify(approval.toolInput);
              const truncated = preview.length > 200 ? preview.slice(0, 200) + '…' : preview;
              return (
                <div
                  key={approval.approvalId}
                  className="flex flex-col gap-2 rounded-md border border-status-warning/50 bg-status-warning/5 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-status-warning">
                      Tool approval required
                    </span>
                    <WaitingTimer receivedAt={approval.receivedAt} />
                  </div>
                  <div className="text-xs font-medium text-foreground">{approval.toolName}</div>
                  <pre className="rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap break-all">
                    {truncated}
                  </pre>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded border border-status-warning bg-status-warning/10 px-3 py-1 text-xs font-medium text-status-warning hover:bg-status-warning/20 transition-colors"
                      onClick={() => approveSubagentTool(approval.approvalId)}
                    >
                      Approve
                    </button>
                    <button
                      className="flex-1 rounded border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                      onClick={() => denySubagentTool(approval.approvalId)}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PromptInputProvider scopes input state to this chat area */}
        <PromptInputProvider>
          <ChatInputWithSlashCommands
            onSubmit={onSubmit}
            onStop={onStop}
            isStreaming={isStreaming}
            modelAlias={modelAlias}
            tokenUsage={tokenUsage}
            shortcutHint={shortcutHint}
            onModelChange={onModelChange}
          />
        </PromptInputProvider>
      </div>
    </div>
  );
}
