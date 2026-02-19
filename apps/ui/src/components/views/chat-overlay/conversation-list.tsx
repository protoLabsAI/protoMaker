/**
 * ConversationList — Slide-out panel showing chat history in the overlay.
 *
 * Lists saved conversations with title, timestamp, and delete action.
 * Clicking a conversation switches to it.
 */

import { MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@protolabs/ui/atoms';
import { cn } from '@/lib/utils';
import type { ChatSession } from '@/store/chat-store';

function formatTime(epoch: number): string {
  const date = new Date(epoch);
  const now = Date.now();
  const diff = now - epoch;

  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationList({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onDelete,
  onClose,
  className,
}: {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="conversation-list"
      className={cn(
        'flex h-full w-56 shrink-0 flex-col border-r border-border bg-muted/30',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Conversations</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onNew}
            aria-label="New conversation"
          >
            <Plus className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onClose}
            aria-label="Close history"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              className={cn(
                'group flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50',
                session.id === currentSessionId && 'bg-accent'
              )}
              onClick={() => onSelect(session.id)}
            >
              <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{session.title}</div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(session.updatedAt)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {session.messages.length} msg{session.messages.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(session.id);
                }}
                aria-label="Delete conversation"
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </Button>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
