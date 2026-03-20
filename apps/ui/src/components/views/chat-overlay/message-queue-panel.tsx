/**
 * MessageQueuePanel — Shows pending messages from the Ava Engine message queue.
 *
 * Fetches from GET {engineBaseUrl}/api/queue, polls every 3 seconds.
 * Supports editing (PUT) and cancelling (DELETE) individual queued messages.
 * Triage result badges: ACT_NOW=red, ABSORB=blue, HOLD=yellow, PENDING=gray.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, X, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EngineQueueMessage } from '@/hooks/use-chat-session';

const POLL_INTERVAL_MS = 3000;

const TRIAGE_CONFIG = {
  ACT_NOW: { label: 'Act Now', className: 'bg-red-500/10 text-red-500 border-red-500/30' },
  ABSORB: { label: 'Absorb', className: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  HOLD: { label: 'Hold', className: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  PENDING: {
    label: 'Pending',
    className: 'bg-muted/50 text-muted-foreground border-border/50',
  },
} satisfies Record<NonNullable<EngineQueueMessage['triage']>, { label: string; className: string }>;

interface QueueApiMessage {
  id: string;
  content: string;
  triage?: 'ACT_NOW' | 'ABSORB' | 'HOLD' | 'PENDING';
  queuedAt?: string;
}

interface QueueApiResponse {
  messages: QueueApiMessage[];
}

interface MessageQueuePanelProps {
  engineBaseUrl: string;
  className?: string;
}

interface EditingState {
  messageId: string;
  draft: string;
}

export function MessageQueuePanel({ engineBaseUrl, className }: MessageQueuePanelProps) {
  const [messages, setMessages] = useState<QueueApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`${engineBaseUrl}/api/queue`, {
        credentials: 'include',
      });
      if (!res.ok) {
        setError(`Queue fetch failed: ${res.status}`);
        return;
      }
      const data = (await res.json()) as QueueApiResponse;
      setMessages(data.messages ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [engineBaseUrl]);

  // Initial load + polling
  useEffect(() => {
    setLoading(true);
    void fetchQueue();

    pollTimerRef.current = setInterval(() => {
      void fetchQueue();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchQueue]);

  const handleEdit = useCallback((msg: QueueApiMessage) => {
    setEditing({ messageId: msg.id, draft: msg.content });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      if (!editing || editing.messageId !== messageId) return;
      const newContent = editing.draft.trim();
      if (!newContent) return;

      setSaving(messageId);
      try {
        const res = await fetch(`${engineBaseUrl}/api/queue/${messageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: newContent }),
        });
        if (res.ok) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
          );
          setEditing(null);
        } else {
          setError(`Save failed: ${res.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(null);
      }
    },
    [editing, engineBaseUrl]
  );

  const handleCancel = useCallback(
    async (messageId: string) => {
      setCancelling(messageId);
      try {
        const res = await fetch(`${engineBaseUrl}/api/queue/${messageId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.ok) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          if (editing?.messageId === messageId) setEditing(null);
        } else {
          setError(`Cancel failed: ${res.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cancel failed');
      } finally {
        setCancelling(null);
      }
    },
    [editing, engineBaseUrl]
  );

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-0.5">
        <span className="text-[11px] font-medium text-foreground/70">
          Queued ({messages.length})
        </span>
        <button
          onClick={() => void fetchQueue()}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Refresh queue"
          aria-label="Refresh queue"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded px-2 py-1 text-[10px] text-red-500 bg-red-500/5 border border-red-500/20">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && messages.length === 0 && !error && (
        <div className="px-2 py-2 text-[11px] text-muted-foreground">No messages queued</div>
      )}

      {/* Message list */}
      <div className="flex flex-col gap-1.5">
        {messages.map((msg) => {
          const triageCfg = TRIAGE_CONFIG[msg.triage ?? 'PENDING'];
          const isEditing = editing?.messageId === msg.id;
          const isSaving = saving === msg.id;
          const isCancelling = cancelling === msg.id;

          return (
            <div
              key={msg.id}
              className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 flex flex-col gap-1"
            >
              {/* Triage badge */}
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'rounded border px-1 py-px text-[9px] font-medium leading-none',
                    triageCfg.className
                  )}
                >
                  {triageCfg.label}
                </span>
              </div>

              {/* Content or edit textarea */}
              {isEditing ? (
                <textarea
                  className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  rows={3}
                  value={editing.draft}
                  onChange={(e) => setEditing({ messageId: msg.id, draft: e.target.value })}
                  autoFocus
                />
              ) : (
                <p className="text-[11px] text-foreground/80 break-words line-clamp-3">
                  {msg.content}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 justify-end">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => void handleSaveEdit(msg.id)}
                      disabled={isSaving}
                      className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      <Check className="size-3" />
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleEdit(msg)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      title="Edit message"
                      aria-label="Edit queued message"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      onClick={() => void handleCancel(msg.id)}
                      disabled={isCancelling}
                      className="rounded p-0.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Cancel message"
                      aria-label="Cancel queued message"
                    >
                      <X className="size-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
