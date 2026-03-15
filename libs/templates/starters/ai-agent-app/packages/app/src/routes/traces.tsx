/**
 * TracesPage — Local observability dashboard for AI agent conversations.
 *
 * Layout:
 *   Left sidebar  — scrollable list of recent traces (newest first)
 *   Right panel   — detail view for the selected trace (TraceViewer)
 *
 * Data source: GET /api/traces (proxied to the Express backend).
 */

import { useState, useEffect, useCallback } from 'react';
import type { Trace } from '../components/trace-viewer.js';
import { TraceViewer } from '../components/trace-viewer.js';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.0001) return '<$0.0001';
  return `$${usd.toFixed(4)}`;
}

// ── TracesPage ────────────────────────────────────────────────────────────────

/**
 * Top-level page that lists all stored traces and shows the selected one
 * in a detail panel using TraceViewer.
 *
 * Usage:
 *   1. Start the Express backend (`npm run dev` in packages/server).
 *   2. Start this Vite app (`npm run dev` in packages/app).
 *   3. Send a few chat messages via POST /api/chat.
 *   4. Open http://localhost:5173 (or the Vite dev server port).
 */
export function TracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchTraces = useCallback(async () => {
    try {
      const res = await fetch('/api/traces');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as Trace[];
      setTraces(data);
      setError(null);

      // Keep the selected trace in sync when refreshing
      if (selected) {
        const updated = data.find((t) => t.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load traces');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selected]);

  useEffect(() => {
    void fetchTraces();
  }, [fetchTraces]);

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchTraces();
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--background)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading traces…</span>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--background)',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* ── Sidebar: trace list ──────────────────────────────────────────── */}
      <aside
        style={{
          width: '20rem',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: '1rem 1rem 0.875rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Traces</h1>
            <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {traces.length} conversation{traces.length !== 1 ? 's' : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: '0.375rem 0.625rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '0.375rem',
              color: 'var(--text-secondary)',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              opacity: refreshing ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
            title="Refresh trace list"
          >
            {refreshing ? '…' : '↻ Refresh'}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(248, 113, 113, 0.08)',
              borderBottom: '1px solid var(--border)',
              color: 'var(--error)',
              fontSize: '0.75rem',
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* Trace list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {traces.length === 0 ? (
            <div
              style={{
                padding: '2.5rem 1rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🔍</div>
              No traces yet.
              <br />
              <span style={{ fontSize: '0.75rem' }}>
                Send a message via the chat API to populate this list.
              </span>
            </div>
          ) : (
            traces.map((trace) => (
              <button
                key={trace.id}
                type="button"
                onClick={() => setSelected(trace)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: selected?.id === trace.id ? 'var(--surface-2)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  borderLeft:
                    selected?.id === trace.id
                      ? '2px solid var(--primary)'
                      : '2px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--foreground)',
                  transition: 'background 0.1s',
                }}
              >
                {/* Row 1: trace ID + duration */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.25rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {trace.id.slice(0, 8)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {fmtDuration(trace.totals.durationMs)}
                  </span>
                </div>

                {/* Row 2: model + cost */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.25rem',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {trace.model}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {fmtCost(trace.totals.costUsd)}
                  </span>
                </div>

                {/* Row 3: timestamp */}
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {fmtDate(trace.startedAt)}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main panel: trace detail ─────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {selected ? (
          <>
            {/* Detail header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                gap: '1rem',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                  Trace{' '}
                  <code
                    style={{
                      fontSize: '0.9rem',
                      background: 'var(--surface-2)',
                      padding: '0.1rem 0.375rem',
                      borderRadius: '0.25rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {selected.id}
                  </code>
                </h2>
                <p
                  style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                >
                  {fmtDate(selected.startedAt)} → {fmtDate(selected.endedAt)}
                  &nbsp;·&nbsp;{selected.model}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.375rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  flexShrink: 0,
                }}
              >
                ✕ Close
              </button>
            </div>

            <TraceViewer trace={selected} />
          </>
        ) : (
          /* Empty state */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                Select a trace from the sidebar to view details.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
