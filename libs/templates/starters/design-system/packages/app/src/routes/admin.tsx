/**
 * AdminRoute — TinaCMS admin panel entry point.
 *
 * In self-hosted mode, TinaCMS runs a local backend server that serves the
 * admin panel at http://localhost:4001/admin. This route acts as a landing
 * page that:
 *
 *   1. Detects whether TinaCMS is running (by probing its health endpoint).
 *   2. Redirects to the admin panel if it is running.
 *   3. Shows setup instructions if it isn't.
 *
 * To start TinaCMS:
 *   cd packages/app
 *   npx tinacms dev -c "vite --port 5174"
 *
 * Once running:
 *   - Admin panel: http://localhost:4001/admin
 *   - Vite dev server: http://localhost:5174
 *   - Visual editing: navigate pages via the admin, edits save to content/*.md
 */

import { useEffect, useState } from 'react';

// ─── TinaCMS health check ─────────────────────────────────────────────────────

type AdminStatus = 'checking' | 'running' | 'offline';

const TINA_ADMIN_URL = 'http://localhost:4001/admin';
const TINA_HEALTH_URL = 'http://localhost:4001/api/tina/gql';

async function checkTinaHealth(): Promise<boolean> {
  try {
    const res = await fetch(TINA_HEALTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Setup steps ──────────────────────────────────────────────────────────────

const SETUP_STEPS = [
  {
    step: 1,
    title: 'Install TinaCMS',
    code: 'npm install tinacms @tinacms/auth',
    description: 'Add TinaCMS and its auth package to the project.',
  },
  {
    step: 2,
    title: 'Start the dev server',
    code: 'npx tinacms dev -c "vite --port 5174"',
    description:
      'This starts the TinaCMS backend (port 4001) alongside your Vite dev server (port 5174).',
  },
  {
    step: 3,
    title: 'Open the admin panel',
    code: 'open http://localhost:4001/admin',
    description:
      'TinaCMS provides a full visual editor. Edits are saved as Markdown/JSON in the content/ directory.',
  },
  {
    step: 4,
    title: 'Build for production',
    code: 'npx tinacms build && vite build',
    description: 'Compiles the admin panel into public/admin/ alongside your static site build.',
  },
] as const;

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  shell: {
    minHeight: '100vh',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 14,
    color: 'var(--pg-fg, #0f172a)',
    background: 'var(--pg-bg, #f8fafc)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '48px 24px',
  } as React.CSSProperties,

  card: {
    background: 'var(--pg-sidebar, #fff)',
    border: '1px solid var(--pg-border, #e2e8f0)',
    borderRadius: 12,
    padding: 32,
    width: '100%',
    maxWidth: 640,
    marginBottom: 24,
  } as React.CSSProperties,

  statusDot: (status: AdminStatus): React.CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: status === 'running' ? '#22c55e' : status === 'offline' ? '#ef4444' : '#f59e0b',
    display: 'inline-block',
    marginRight: 8,
    animation: status === 'checking' ? 'pulse 1s infinite' : 'none',
  }),

  stepCard: {
    border: '1px solid var(--pg-border, #e2e8f0)',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
    background: 'var(--pg-bg, #f8fafc)',
  } as React.CSSProperties,

  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--primary, #6366f1)',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    marginRight: 12,
    flexShrink: 0,
  } as React.CSSProperties,

  code: {
    display: 'block',
    background: '#1e293b',
    color: '#e2e8f0',
    borderRadius: 6,
    padding: '10px 14px',
    fontFamily: '"SF Mono", "Fira Code", Menlo, monospace',
    fontSize: 13,
    marginTop: 10,
    marginBottom: 6,
    overflowX: 'auto' as const,
    whiteSpace: 'pre' as const,
  } as React.CSSProperties,

  primaryButton: {
    display: 'inline-block',
    background: 'var(--primary, #6366f1)',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: 8,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    border: 'none',
    cursor: 'pointer',
    marginRight: 12,
  } as React.CSSProperties,

  outlineButton: {
    display: 'inline-block',
    background: 'transparent',
    color: 'var(--primary, #6366f1)',
    padding: '10px 20px',
    borderRadius: 8,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    border: '1px solid var(--primary, #6366f1)',
    cursor: 'pointer',
  } as React.CSSProperties,
} as const;

// ─── AdminRoute ───────────────────────────────────────────────────────────────

export function AdminRoute() {
  const [status, setStatus] = useState<AdminStatus>('checking');

  useEffect(() => {
    void checkTinaHealth().then((ok) => {
      setStatus(ok ? 'running' : 'offline');
      if (ok) {
        // Redirect to TinaCMS admin panel
        window.location.href = TINA_ADMIN_URL;
      }
    });
  }, []);

  return (
    <div style={S.shell}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* ── Status card ── */}
      <div style={S.card}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>TinaCMS Admin</h1>
        <p style={{ margin: '0 0 20px', opacity: 0.6 }}>Visual content editor backed by git</p>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <span style={S.statusDot(status)} />
          <span style={{ fontWeight: 500 }}>
            {status === 'checking' && 'Checking TinaCMS status…'}
            {status === 'running' && 'TinaCMS is running — redirecting to admin…'}
            {status === 'offline' && 'TinaCMS is not running'}
          </span>
        </div>

        {status === 'running' && (
          <a href={TINA_ADMIN_URL} style={S.primaryButton}>
            Open Admin Panel →
          </a>
        )}

        {status === 'offline' && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
            <a href="/" style={S.outlineButton}>
              ← Back to Site
            </a>
            <button
              style={S.outlineButton}
              onClick={() => {
                setStatus('checking');
                void checkTinaHealth().then((ok) => {
                  setStatus(ok ? 'running' : 'offline');
                  if (ok) window.location.href = TINA_ADMIN_URL;
                });
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Setup instructions ── */}
      {status !== 'running' && (
        <div style={S.card}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>How to start TinaCMS</h2>
          <p style={{ margin: '0 0 20px', opacity: 0.6, fontSize: 13 }}>
            TinaCMS runs as a local server that provides visual editing for your git-backed Markdown
            content. No external services required.
          </p>

          {SETUP_STEPS.map(({ step, title, code, description }) => (
            <div key={step} style={S.stepCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={S.stepNumber}>{step}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
                  <div style={{ opacity: 0.65, fontSize: 13, marginBottom: 4 }}>{description}</div>
                  <code style={S.code}>{code}</code>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Content schema overview ── */}
      <div style={S.card}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Content Schema</h2>
        <p style={{ margin: '0 0 16px', opacity: 0.6, fontSize: 13 }}>
          TinaCMS manages these four content types. All content is stored as Markdown files in the{' '}
          <code>content/</code> directory.
        </p>

        {[
          {
            label: 'Pages',
            path: 'content/pages/*.md',
            desc: 'General site pages with title, description, and body',
          },
          {
            label: 'Component Docs',
            path: 'content/components/*.md',
            desc: 'Per-component documentation with category, status, and usage examples',
          },
          {
            label: 'Design Guidelines',
            path: 'content/guidelines/*.md',
            desc: 'Design principles covering color, typography, spacing, and accessibility',
          },
          {
            label: 'Changelog',
            path: 'content/changelog/*.md',
            desc: 'Version history with release type (major / minor / patch) and date',
          },
        ].map(({ label, path, desc }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              gap: 16,
              padding: '12px 0',
              borderBottom: '1px solid var(--pg-border, #e2e8f0)',
            }}
          >
            <div style={{ width: 120, flexShrink: 0 }}>
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2, fontFamily: 'monospace' }}>
                {path}
              </div>
            </div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
