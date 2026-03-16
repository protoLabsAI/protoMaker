/**
 * ChatMessageList — Scrollable message container with stick-to-bottom behaviour.
 *
 * Automatically follows new content while the user is at the bottom.
 * When the user scrolls up, auto-scroll pauses without interruption.
 * A "scroll to bottom" button re-appears whenever the view is not at the bottom.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '../lib/utils.js';
import { Button } from '../ui/button.js';
import { ChatMessage } from './chat-message.js';
import { ShimmerLoader } from './shimmer.js';
import { SubagentApprovalCard } from './subagent-approval-card.js';
import type { PendingSubagentApproval } from './subagent-approval-card.js';

/** Per-message branch info keyed by message ID. */
export interface BranchInfo {
  branchIndex: number;
  branchCount: number;
  origId: string;
}

// Re-export so consumers can import from this module
export type { PendingSubagentApproval };

export function ChatMessageList({
  messages,
  emptyMessage = 'Start a conversation...',
  className,
  isStreaming,
  onRegenerate,
  onThumbsUp,
  onThumbsDown,
  onToolApprove,
  onToolReject,
  branchInfoMap,
  pendingBranchOrigId,
  onPreviousBranch,
  onNextBranch,
  getToolProgressLabel,
  pendingSubagentApprovals,
  onSubagentApprove,
  onSubagentDeny,
}: {
  messages: UIMessage[];
  emptyMessage?: string;
  className?: string;
  /** When true, shows a ShimmerLoader at the bottom if the last message has no text yet. */
  isStreaming?: boolean;
  /** Called when the user clicks Regenerate on an assistant message. */
  onRegenerate?: () => void;
  /** Called when the user clicks Thumbs Up on an assistant message. */
  onThumbsUp?: () => void;
  /** Called when the user clicks Thumbs Down on an assistant message. */
  onThumbsDown?: () => void;
  /** Called when the user approves a destructive tool call (HITL). Receives the approval ID. */
  onToolApprove?: (approvalId: string) => void;
  /** Called when the user rejects a destructive tool call (HITL). Receives the approval ID. */
  onToolReject?: (approvalId: string) => void;
  /** Branch info keyed by message ID — provided by the parent managing branch state. */
  branchInfoMap?: Map<string, BranchInfo>;
  /** The origId of the message currently being regenerated. */
  pendingBranchOrigId?: string | null;
  /** Called with the origId when the user navigates to the previous branch. */
  onPreviousBranch?: (origId: string) => void;
  /** Called with the origId when the user navigates to the next branch. */
  onNextBranch?: (origId: string) => void;
  /** Returns a live progress label for a running tool, keyed by toolCallId. */
  getToolProgressLabel?: (toolCallId: string) => string | undefined;
  /** Pending subagent tool approvals from the gated trust model. */
  pendingSubagentApprovals?: PendingSubagentApproval[];
  /** Called when the user approves a subagent tool call. Receives the approvalId. */
  onSubagentApprove?: (approvalId: string) => void;
  /** Called when the user denies a subagent tool call. Receives the approvalId. */
  onSubagentDeny?: (approvalId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userScrolledRef = useRef(false);

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    userScrolledRef.current = false;
    setIsAtBottom(true);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      if (atBottom) {
        userScrolledRef.current = false;
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        userScrolledRef.current = true;
      } else if (e.deltaY > 0 && checkIfAtBottom()) {
        userScrolledRef.current = false;
      }
    };

    const handleTouchMove = () => {
      userScrolledRef.current = true;
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, [checkIfAtBottom]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let rafPending = false;
    const observer = new MutationObserver(() => {
      if (!userScrolledRef.current && !rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          if (!userScrolledRef.current) {
            scrollToBottom('instant');
          }
        });
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom('instant');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const prevIsStreamingRef = useRef(isStreaming);
  useLayoutEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming && !userScrolledRef.current) {
      scrollToBottom('instant');
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming, scrollToBottom]);

  const lastMessage = messages[messages.length - 1];
  const lastMessageHasNoText =
    !lastMessage ||
    !(lastMessage.parts ?? []).some(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && !!(p as { type: 'text'; text: string }).text
    );
  const showShimmer = !!isStreaming && lastMessageHasNoText;

  return (
    <div data-slot="chat-message-list" className={cn('relative flex-1 overflow-hidden', className)}>
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div ref={contentRef} className="space-y-1 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            messages.map((message, idx) => {
              const branchInfo = branchInfoMap?.get(message.id);
              const isLastMessage = idx === messages.length - 1;
              const isRegenerating =
                !!pendingBranchOrigId &&
                (branchInfo?.origId === pendingBranchOrigId || message.id === pendingBranchOrigId);
              return (
                <div key={message.id}>
                  <ChatMessage
                    message={message}
                    isStreaming={isStreaming && isLastMessage}
                    onRegenerate={onRegenerate}
                    onThumbsUp={onThumbsUp}
                    onThumbsDown={onThumbsDown}
                    onToolApprove={onToolApprove}
                    onToolReject={onToolReject}
                    branchIndex={branchInfo?.branchIndex}
                    branchCount={branchInfo?.branchCount}
                    onPreviousBranch={
                      branchInfo ? () => onPreviousBranch?.(branchInfo.origId) : undefined
                    }
                    onNextBranch={branchInfo ? () => onNextBranch?.(branchInfo.origId) : undefined}
                    getToolProgressLabel={getToolProgressLabel}
                  />
                  {isRegenerating && (
                    <div>
                      <p className="px-4 pb-1 text-xs text-muted-foreground">Regenerating...</p>
                      <ShimmerLoader />
                    </div>
                  )}
                </div>
              );
            })
          )}
          {showShimmer && <ShimmerLoader />}

          {/* Subagent tool approval cards (gated trust model) */}
          {pendingSubagentApprovals && pendingSubagentApprovals.length > 0 && (
            <div className="px-4">
              {pendingSubagentApprovals.map((approval) => (
                <SubagentApprovalCard
                  key={approval.approvalId}
                  approvalId={approval.approvalId}
                  toolName={approval.toolName}
                  toolInput={approval.toolInput}
                  receivedAt={approval.receivedAt}
                  onApprove={onSubagentApprove}
                  onDeny={onSubagentDeny}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {!isAtBottom && messages.length > 0 && (
        <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full shadow-md"
            onClick={() => scrollToBottom()}
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
