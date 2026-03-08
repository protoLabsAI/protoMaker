/**
 * ChatOverlayContent — Shared chat content for overlay and modal.
 *
 * Contains the header, tab bar, and tab content areas.
 * Tab 1: Ask Ava — human<>Ava chat (unchanged behavior)
 * Tab 2: Ava Channel — private Ava-to-Ava coordination message stream
 *
 * Used by both the Electron overlay view and the web fallback modal.
 *
 * Reads currentProject from useAppStore and passes projectId/projectPath
 * to useChatSession for project-scoped session management.
 *
 * Input state is managed via PromptInputProvider so ChatInput does not
 * require value/onChange props to be threaded through the tree.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { UIMessage } from 'ai';
import { History, X, Settings, ChevronUp, ChevronDown, SquarePen, ListOrdered } from 'lucide-react';
import { type BranchInfo } from '@protolabsai/ui/ai';
import { Button } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useChatSession } from '@/hooks/use-chat-session';
import { useAppStore } from '@/store/app-store';
import { useContextualSuggestions } from '@/hooks/use-contextual-suggestions';
import { useToolProgress } from '@/hooks/use-tool-progress';
import { ChatStatusBar } from './chat-status-bar';
import { getOverlayAPI } from '@/lib/electron';
import { AskAvaTab } from './ask-ava-tab';
import { AvaChannelTab } from './ava-channel-tab';
import {
  useAvaChannelStore,
  type AvaChannelTab as AvaChannelTabType,
} from '@/store/ava-channel-store';

const OVERLAY_HEIGHT_DEFAULT = 600;
const OVERLAY_HEIGHT_EXPANDED = 900;

export interface ChatOverlayContentProps {
  /** Called when the user wants to close/hide the overlay or modal */
  onHide: () => void;
  /** When true, renders in modal mode (no drag region, different hint text) */
  isModal?: boolean;
}

export function ChatOverlayContent({ onHide, isModal = false }: ChatOverlayContentProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);

  const {
    messages,
    sendMessage,
    stop,
    isStreaming,
    error,
    sessions,
    currentSessionId,
    modelAlias,
    handleNewChat,
    handleSwitchSession,
    handleDeleteSession,
    handleModelChange,
    approveToolAction,
    rejectToolAction,
    historyOpen,
    toggleHistory,
    setHistoryOpen,
  } = useChatSession({
    defaultModel: 'sonnet',
    projectId: currentProject?.id,
    projectPath: currentProject?.path,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);

  // Tab state — persisted in ava-channel-store so keyboard shortcut restores last active tab
  const lastActiveTab = useAvaChannelStore((s) => s.lastActiveTab);
  const setLastActiveTab = useAvaChannelStore((s) => s.setLastActiveTab);
  const [activeTab, setActiveTab] = useState<AvaChannelTabType>(lastActiveTab);

  const handleTabChange = useCallback(
    (tab: AvaChannelTabType) => {
      setActiveTab(tab);
      setLastActiveTab(tab);
    },
    [setLastActiveTab]
  );

  // Branch state — tracks multiple response variants per assistant message.
  // branchMap key: the ID of the first (original) assistant message variant.
  // branchMap value: all variants in order (original first, newest last).
  const [branchMap, setBranchMap] = useState<Map<string, UIMessage[]>>(new Map());
  const [currentBranchIndex, setCurrentBranchIndex] = useState<Map<string, number>>(new Map());
  // Set to the origId when a regeneration is in-flight, cleared when the new
  // assistant message arrives and is added to the branch list.
  const pendingBranchFor = useRef<string | null>(null);

  const suggestions = useContextualSuggestions(features ?? []);
  const { getProgressLabel, activeLabel: activeToolLabel } = useToolProgress();

  // Show current context window size from the most recent data-usage part.
  // The server sends inputTokens (= prompt size sent to the model) after each
  // response. The latest value is the best measure of context window usage.
  // Falls back to chars/4 estimate before the first response arrives.
  const tokenUsage = useMemo(() => {
    let latestInput = 0;
    let latestOutput = 0;
    let hasReal = false;
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.parts) continue;
      for (const part of msg.parts) {
        if (part.type === 'data-usage' && part.data) {
          const d = part.data as { inputTokens?: number; outputTokens?: number };
          latestInput = d.inputTokens ?? 0;
          latestOutput = d.outputTokens ?? 0;
          hasReal = true;
        }
      }
    }
    if (hasReal) {
      return { total: latestInput, input: latestInput, output: latestOutput, estimated: false };
    }
    // Fallback: rough estimate before first response completes
    if (messages.length === 0) return { total: 0, input: 0, output: 0, estimated: true };
    const chars = JSON.stringify(messages).length;
    return { total: Math.ceil(chars / 4), input: 0, output: 0, estimated: true };
  }, [messages]);

  // Count agentic steps in the current streaming message for the status bar
  const stepCount = useMemo(() => {
    if (!isStreaming || messages.length === 0) return 0;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return 0;
    return (lastMsg.parts ?? []).filter((p) => p.type === 'step-start').length;
  }, [messages, isStreaming]);

  // onSubmit receives the trimmed text from ChatInput (via PromptInputProvider).
  // ChatInput clears the input immediately after calling this.
  const handleSubmit = useCallback(
    (text: string) => {
      if (isStreaming) return;
      sendMessage({ text });
    },
    [isStreaming, sendMessage]
  );

  const handleSuggestionSelect = useCallback(
    (value: string) => {
      sendMessage({ text: value });
    },
    [sendMessage]
  );

  const handleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    getOverlayAPI()?.resizeOverlay?.(next ? OVERLAY_HEIGHT_EXPANDED : OVERLAY_HEIGHT_DEFAULT);
  }, [expanded]);

  // Regenerate: push the current last assistant response as a branch variant,
  // then re-send the last user message to generate a new response.
  const handleRegenerate = useCallback(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastAssistant || !lastUserMsg) return;

    const origId = lastAssistant.id;

    // Register the current response as the first branch (if not already tracked)
    setBranchMap((prev) => {
      if (prev.has(origId)) return prev;
      const next = new Map(prev);
      next.set(origId, [lastAssistant]);
      return next;
    });
    setCurrentBranchIndex((prev) => {
      if (prev.has(origId)) return prev;
      const next = new Map(prev);
      next.set(origId, 0);
      return next;
    });

    // Mark that the next completed assistant message should be added to this branch
    pendingBranchFor.current = origId;

    // Re-send the last user message
    const text = (lastUserMsg.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (text) sendMessage({ text });
  }, [messages, sendMessage]);

  // Detect when a regenerated response has finished streaming and add it to
  // the appropriate branch list.
  useEffect(() => {
    if (!pendingBranchFor.current || isStreaming) return;

    const origId = pendingBranchFor.current;
    const currentBranches = branchMap.get(origId) ?? [];
    const knownIds = new Set(currentBranches.map((b) => b.id));

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant || knownIds.has(lastAssistant.id)) return;

    // New finished assistant message — add as latest branch and focus it
    const newBranches = [...currentBranches, lastAssistant];
    setBranchMap((prev) => {
      const next = new Map(prev);
      next.set(origId, newBranches);
      return next;
    });
    setCurrentBranchIndex((prev) => {
      const next = new Map(prev);
      next.set(origId, newBranches.length - 1);
      return next;
    });
    pendingBranchFor.current = null;
  }, [messages, isStreaming, branchMap]);

  // Clear branch state when starting a new chat session
  useEffect(() => {
    setBranchMap(new Map());
    setCurrentBranchIndex(new Map());
    pendingBranchFor.current = null;
  }, [currentSessionId]);

  // Navigate to the previous branch variant for a given message
  const handlePreviousBranch = useCallback((origId: string) => {
    setCurrentBranchIndex((prev) => {
      const idx = prev.get(origId) ?? 0;
      if (idx <= 0) return prev;
      const next = new Map(prev);
      next.set(origId, idx - 1);
      return next;
    });
  }, []);

  // Navigate to the next branch variant for a given message
  const handleNextBranch = useCallback(
    (origId: string) => {
      setCurrentBranchIndex((prev) => {
        const variants = branchMap.get(origId);
        const idx = prev.get(origId) ?? 0;
        if (!variants || idx >= variants.length - 1) return prev;
        const next = new Map(prev);
        next.set(origId, idx + 1);
        return next;
      });
    },
    [branchMap]
  );

  // Compute displayed messages — substitute branch variants at branch positions
  // and trim the re-sent user+assistant pairs that accumulate after regenerations.
  const displayedMessages = useMemo<UIMessage[]>(() => {
    if (branchMap.size === 0) return messages;

    let result = [...messages];
    // Process each branch point (typically just one at a time in practice)
    for (const [origId, variants] of branchMap) {
      const idx = currentBranchIndex.get(origId) ?? variants.length - 1;
      const origPos = result.findIndex((m) => m.id === origId);
      if (origPos === -1) continue;
      // Replace from the original position onwards with the selected variant
      result = [...result.slice(0, origPos), variants[idx]];
    }
    return result;
  }, [messages, branchMap, currentBranchIndex]);

  // Build branchInfoMap for ChatMessageList — maps each displayed variant's ID
  // to its branch navigation context so ChatMessage can show the nav bar.
  const branchInfoMap = useMemo<Map<string, BranchInfo>>(() => {
    const map = new Map<string, BranchInfo>();
    for (const [origId, variants] of branchMap) {
      const idx = currentBranchIndex.get(origId) ?? variants.length - 1;
      // Tag all variants so the currently displayed one gets nav props
      for (let i = 0; i < variants.length; i++) {
        map.set(variants[i].id, { branchIndex: idx, branchCount: variants.length, origId });
      }
    }
    return map;
  }, [branchMap, currentBranchIndex]);

  // Thumbs up/down — no-op placeholders; wire to telemetry or feedback API as needed
  const handleThumbsUp = useCallback(() => {
    // Positive feedback placeholder
  }, []);

  const handleThumbsDown = useCallback(() => {
    // Negative feedback placeholder
  }, []);

  const shortcutHint = isModal ? '\u2318K to close' : 'Esc to hide';

  // Escape key: close history panel if open, otherwise hide the overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (historyOpen) {
          setHistoryOpen(false);
        } else {
          onHide();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyOpen, setHistoryOpen, onHide]);

  return (
    <div data-slot="chat-overlay-content" className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-3 py-2',
          !isModal && 'titlebar-drag-region'
        )}
      >
        <div className={cn('flex items-center gap-2', !isModal && 'pointer-events-none')}>
          <div className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">Ava</span>
        </div>
        <div className={cn('flex items-center gap-1', !isModal && 'pointer-events-auto')}>
          {activeTab === 'ask-ava' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={toggleHistory}
                title="Conversation history"
                aria-label="Toggle conversation history"
              >
                <History className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setQueueOpen((v) => !v)}
                title="Feature queue"
                aria-label="Toggle feature queue"
                data-testid="queue-panel-toggle"
              >
                <ListOrdered className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleNewChat}
                title="New chat"
                aria-label="New chat"
              >
                <SquarePen className="size-3.5" />
              </Button>
            </>
          )}
          {!isModal && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleExpand}
              title={expanded ? 'Collapse' : 'Expand'}
              aria-label={expanded ? 'Collapse overlay' : 'Expand overlay'}
            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings"
            aria-label="Toggle settings"
          >
            <Settings className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onHide}
            title={isModal ? 'Close' : 'Hide (Esc)'}
            aria-label={isModal ? 'Close chat' : 'Hide overlay'}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Error banner — shown for Ask Ava tab errors */}
      {activeTab === 'ask-ava' && error && (
        <div className="border-b border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error.message || 'An error occurred'}
        </div>
      )}

      {/* Status bar — tool progress + project event tickers */}
      {activeTab === 'ask-ava' && (
        <ChatStatusBar
          toolProgressLabel={activeToolLabel}
          isStreaming={isStreaming}
          stepCount={stepCount}
        />
      )}

      {/* Tab bar */}
      <div className="flex items-center border-b border-border px-2">
        <button
          type="button"
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'ask-ava'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => handleTabChange('ask-ava')}
          aria-selected={activeTab === 'ask-ava'}
        >
          Ask Ava
        </button>
        <button
          type="button"
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'ava-channel'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => handleTabChange('ava-channel')}
          aria-selected={activeTab === 'ava-channel'}
        >
          Ava Channel
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'ask-ava' ? (
        <AskAvaTab
          displayedMessages={displayedMessages}
          isStreaming={isStreaming}
          suggestions={suggestions}
          sessions={sessions}
          currentSessionId={currentSessionId}
          modelAlias={modelAlias}
          tokenUsage={tokenUsage}
          branchInfoMap={branchInfoMap}
          settingsOpen={settingsOpen}
          historyOpen={historyOpen}
          queueOpen={queueOpen}
          queuePaused={queuePaused}
          projectPath={currentProject?.path}
          shortcutHint={shortcutHint}
          onSubmit={handleSubmit}
          onStop={stop}
          onSuggestionSelect={handleSuggestionSelect}
          onRegenerate={handleRegenerate}
          onThumbsUp={handleThumbsUp}
          onThumbsDown={handleThumbsDown}
          onToolApprove={approveToolAction}
          onToolReject={rejectToolAction}
          onPreviousBranch={handlePreviousBranch}
          onNextBranch={handleNextBranch}
          onSelectSession={handleSwitchSession}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
          onCloseHistory={() => setHistoryOpen(false)}
          onToggleQueuePause={() => setQueuePaused((v) => !v)}
          onModelChange={handleModelChange}
          getToolProgressLabel={getProgressLabel}
        />
      ) : (
        <AvaChannelTab />
      )}
    </div>
  );
}
