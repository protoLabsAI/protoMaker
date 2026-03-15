import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
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
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Settings</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Model config */}
        <section
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Model</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Configure your AI model and provider settings.
          </p>
        </section>

        {/* Theme config */}
        <section
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Theme</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Customize the appearance of your app.
          </p>
        </section>
      </div>
    </div>
  );
}
