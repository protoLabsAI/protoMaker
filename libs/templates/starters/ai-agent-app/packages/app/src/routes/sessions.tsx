import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useSessionStore } from '../store/session-store.js';

export const Route = createFileRoute('/sessions')({
  component: SessionsPage,
});

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SessionsPage() {
  const { sessions, currentSessionId, createSession, switchSession, deleteSession } =
    useSessionStore();
  const navigate = useNavigate();

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleSelect = (id: string) => {
    switchSession(id);
    void navigate({ to: '/' });
  };

  const handleNew = () => {
    createSession();
    void navigate({ to: '/' });
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSession(id);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sessions</h1>
        <button
          onClick={handleNew}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          New Chat
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">No sessions yet. Start a new chat!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {sorted.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSelect(session.id)}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3.5 py-2.5 transition-colors hover:bg-accent/50 ${
                session.id === currentSessionId ? 'bg-accent' : 'bg-card'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{session.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{session.messages.length} messages</span>
                  <span>{timeAgo(session.updatedAt)}</span>
                </div>
              </div>

              <span className="whitespace-nowrap rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {session.model.includes('haiku')
                  ? 'Haiku'
                  : session.model.includes('sonnet')
                    ? 'Sonnet'
                    : session.model.includes('opus')
                      ? 'Opus'
                      : session.model}
              </span>

              <button
                onClick={(e) => handleDelete(e, session.id)}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                title="Delete session"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
