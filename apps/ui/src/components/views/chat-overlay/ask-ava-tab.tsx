/**
 * AskAvaTab — the human<>Ava chat tab for the overlay and modal.
 *
 * Extracted from ChatOverlayContent to support a two-tab layout.
 * Contains: queue panel, conversation history panel, settings panel, chat area.
 */

import type { UIMessage } from 'ai';
import {
  ChatMessageList,
  ChatInput,
  SuggestionList,
  PromptInputProvider,
  QueueView,
  type BranchInfo,
} from '@protolabsai/ui/ai';
import { cn } from '@/lib/utils';
import { ChatModelSelect } from '@/components/views/chat/components/chat-model-select';
import { ConversationList } from './conversation-list';
import { AvaSettingsPanel } from './ava-settings-panel';
import type { ChatSession } from '@/store/chat-store';
import type { SuggestionItem } from '@protolabsai/ui/ai';

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
}: AskAvaTabProps) {
  return (
    <div className="flex min-h-0 flex-1">
      {/* Queue panel — slide in from left */}
      {queueOpen && (
        <div className="w-56 shrink-0 border-r border-border overflow-y-auto p-2 animate-in slide-in-from-left duration-200">
          <QueueView
            items={[]}
            paused={queuePaused}
            onTogglePause={onToggleQueuePause}
          />
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
          onPreviousBranch={onPreviousBranch}
          onNextBranch={onNextBranch}
          getToolProgressLabel={getToolProgressLabel}
        />

        {/* Contextual suggestions — shown only when no messages in current session */}
        {displayedMessages.length === 0 && (
          <SuggestionList suggestions={suggestions} onSelect={onSuggestionSelect} />
        )}

        {/* PromptInputProvider scopes input state to this chat area */}
        <PromptInputProvider>
          <ChatInput
            onSubmit={onSubmit}
            onStop={onStop}
            isStreaming={isStreaming}
            placeholder="Ask Ava..."
            autoFocus
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
                          ? 'text-yellow-500'
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
        </PromptInputProvider>
      </div>
    </div>
  );
}
