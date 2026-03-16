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
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <h1 className="mb-4 text-lg font-semibold">Settings</h1>
      <div className="flex max-w-lg flex-col gap-3">
        {/* Model config */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Default Model</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Model used when creating new chat sessions.
          </p>
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-sm text-foreground"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.alias} value={m.alias}>
                {m.label}
              </option>
            ))}
          </select>
        </section>

        {/* Theme config */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Theme</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Customize the appearance of your app.
          </p>
          <div className="flex gap-1">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  theme === opt.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-input text-foreground hover:bg-accent'
                }`}
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
