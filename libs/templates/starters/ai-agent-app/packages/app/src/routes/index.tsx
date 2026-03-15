import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: ChatPage,
});

function ChatPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Chat</h1>
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
          Start a conversation with your AI agent.
        </p>
      </div>
    </div>
  );
}
