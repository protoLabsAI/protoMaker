/**
 * AvaChannelTab — read-only stream of private Ava-to-Ava coordination messages.
 *
 * Shows chronological messages with instance badges. Real-time updates are
 * appended via useAvaChannelStore. Empty state shown when hivemind is inactive.
 * Operator override input (amber-toned, collapsed by default) allows injecting
 * messages into the channel.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, ChevronUp, Send, RefreshCw } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useAvaChannelStore, useAvaChannelLiveUpdates } from '@/store/ava-channel-store';
import type { AvaChatMessage } from '@protolabsai/types';

// ============================================================================
// Sub-components
// ============================================================================

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function InstanceBadge({
  instanceName,
  source,
}: {
  instanceName: string;
  source: AvaChatMessage['source'];
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        source === 'operator'
          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
          : source === 'system'
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary/10 text-primary'
      )}
    >
      {source === 'operator' ? 'operator' : instanceName}
    </span>
  );
}

function isErrorMessage(message: AvaChatMessage): boolean {
  return (
    message.content.includes('error') ||
    message.content.includes('ERROR') ||
    (message.source === 'system' && message.content.startsWith('[health_alert]'))
  );
}

function isProtocolMessage(message: AvaChatMessage): boolean {
  return message.content.startsWith('[');
}

function ChannelMessage({ message, isProtocol }: { message: AvaChatMessage; isProtocol: boolean }) {
  const isError = isErrorMessage(message);
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 py-2 border-b border-border/50 last:border-0',
        isError && 'border-l-2 border-l-destructive pl-2',
        isProtocol && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-2">
        <InstanceBadge instanceName={message.instanceName} source={message.source} />
        <span className="text-[10px] text-muted-foreground">
          {formatRelativeTime(message.timestamp)}
        </span>
      </div>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        {message.content}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="size-8 rounded-full bg-muted flex items-center justify-center">
        <div className="size-3 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Hivemind not active</p>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          Enable multi-instance coordination in{' '}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">proto.config.yaml</code>
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function AvaChannelTab() {
  const messages = useAvaChannelStore((s) => s.messages);
  const loading = useAvaChannelStore((s) => s.loading);
  const error = useAvaChannelStore((s) => s.error);
  const hivemindActive = useAvaChannelStore((s) => s.hivemindActive);
  const filterQuery = useAvaChannelStore((s) => s.filterQuery);
  const fetchMessages = useAvaChannelStore((s) => s.fetchMessages);
  const sendOperatorMessage = useAvaChannelStore((s) => s.sendOperatorMessage);
  const setFilterQuery = useAvaChannelStore((s) => s.setFilterQuery);

  useAvaChannelLiveUpdates();

  const [operatorOpen, setOperatorOpen] = useState(false);
  const [operatorInput, setOperatorInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showProtocol, setShowProtocol] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch messages on mount and when showProtocol changes
  useEffect(() => {
    fetchMessages({ limit: 50, includeProtocol: showProtocol });
  }, [fetchMessages, showProtocol]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendOperator = useCallback(async () => {
    const text = operatorInput.trim();
    if (!text || sending) return;
    setSending(true);
    await sendOperatorMessage(text);
    setOperatorInput('');
    setSending(false);
  }, [operatorInput, sending, sendOperatorMessage]);

  const handleOperatorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSendOperator();
      }
    },
    [handleSendOperator]
  );

  // Filter messages by query and protocol visibility
  const filteredMessages = messages.filter((m) => {
    // Hide protocol messages when showProtocol is false
    if (!showProtocol && isProtocolMessage(m)) return false;
    // Apply text search filter
    if (filterQuery.trim()) {
      return (
        m.content.toLowerCase().includes(filterQuery.toLowerCase()) ||
        m.instanceName.toLowerCase().includes(filterQuery.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Search className="size-3 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter messages..."
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          type="button"
          onClick={() => setShowProtocol((v) => !v)}
          title={showProtocol ? 'Hide protocol messages' : 'Show protocol messages'}
          aria-pressed={showProtocol}
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
            showProtocol
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Protocol
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => fetchMessages({ limit: 50, includeProtocol: showProtocol })}
          title="Refresh"
          aria-label="Refresh channel messages"
          disabled={loading}
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Message stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-xs text-muted-foreground">Loading messages...</div>
          </div>
        ) : !hivemindActive && messages.length === 0 ? (
          <EmptyState />
        ) : filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-xs text-muted-foreground">No messages match your filter</div>
          </div>
        ) : (
          <div className="py-2">
            {filteredMessages.map((message) => (
              <ChannelMessage
                key={message.id}
                message={message}
                isProtocol={isProtocolMessage(message)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Operator override — collapsed by default, amber-toned */}
      <div className="border-t border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors"
          onClick={() => setOperatorOpen((v) => !v)}
          aria-expanded={operatorOpen}
        >
          <span className="font-medium">Send as Operator</span>
          {operatorOpen ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
        </button>

        {operatorOpen && (
          <div className="border-t border-amber-200/60 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/10 px-2 py-2">
            <div className="flex gap-2">
              <textarea
                value={operatorInput}
                onChange={(e) => setOperatorInput(e.target.value)}
                onKeyDown={handleOperatorKeyDown}
                placeholder="Inject an operator message into the Ava channel..."
                rows={2}
                className="flex-1 resize-none rounded border border-amber-300/60 dark:border-amber-700/40 bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-amber-400/60"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 self-end text-amber-600 dark:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
                onClick={handleSendOperator}
                disabled={!operatorInput.trim() || sending}
                title="Send operator message"
                aria-label="Send operator message"
              >
                <Send className="size-3" />
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Enter to send, Shift+Enter for new line
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
