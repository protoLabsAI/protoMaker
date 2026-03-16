import { createFileRoute } from '@tanstack/react-router';
import { useSettingsStore, type Theme } from '../store/settings-store.js';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

const MODEL_OPTIONS = [
  { alias: 'claude-haiku-4-5-20251001', label: 'Haiku' },
  { alias: 'claude-sonnet-4-6', label: 'Sonnet' },
  { alias: 'claude-opus-4-6', label: 'Opus' },
] as const;

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

function SettingsPage() {
  const { defaultModel, theme, setDefaultModel, setTheme } = useSettingsStore();

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        {/* Model config */}
        <section
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Default Model</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            Model used when creating new chat sessions.
          </p>
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--surface-2)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.alias} value={m.alias}>
                {m.label}
              </option>
            ))}
          </select>
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
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Theme</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            Customize the appearance of your app.
          </p>
          <div style={{ display: 'flex', gap: 4 }}>
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: theme === opt.value ? 'var(--primary)' : 'var(--surface-2)',
                  color: theme === opt.value ? 'var(--primary-foreground)' : 'var(--foreground)',
                  transition: 'background-color 150ms, color 150ms',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
