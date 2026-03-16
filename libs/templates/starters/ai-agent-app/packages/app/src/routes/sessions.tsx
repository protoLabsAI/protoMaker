import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Sessions</h1>
        <button
          onClick={handleNew}
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          New Chat
        </button>
      </div>

      {sorted.length === 0 ? (
        <div
          style={{
            flex: 1,
            borderRadius: 8,
            border: '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            No sessions yet. Start a new chat!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSelect(session.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                backgroundColor:
                  session.id === currentSessionId ? 'var(--surface-2)' : 'var(--surface)',
                cursor: 'pointer',
                transition: 'background-color 150ms',
              }}
            >
              {/* Title + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {session.title}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 2,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>{session.messages.length} messages</span>
                  <span>{timeAgo(session.updatedAt)}</span>
                </div>
              </div>

              {/* Model badge */}
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  backgroundColor: 'var(--surface-3)',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {session.model.includes('haiku')
                  ? 'Haiku'
                  : session.model.includes('sonnet')
                    ? 'Sonnet'
                    : session.model.includes('opus')
                      ? 'Opus'
                      : session.model}
              </span>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, session.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: 4,
                  fontSize: 14,
                  lineHeight: 1,
                }}
                title="Delete session"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
