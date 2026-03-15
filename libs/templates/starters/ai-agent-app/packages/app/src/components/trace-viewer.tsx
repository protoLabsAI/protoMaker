/**
 * TraceViewer — Detail view for a single AI agent trace.
 *
 * Displays:
 *   - Summary stats: duration, cost, token counts, step count
 *   - Latency waterfall: relative bar chart of per-step duration
 *   - Step breakdown: tokens, cost, and tool calls for each step
 *   - Tool call detail: collapsible input/output JSON
 */

import React, { useState } from 'react';

// ── Types (mirrored from packages/server/src/tracing/types.ts) ───────────────

export interface TraceToolCall {
  id: string;
  name: string;
  input: unknown;
  output: unknown;
  durationMs: number;
}

export interface TraceStep {
  index: number;
  type: string;
  text: string;
  durationMs: number;
  tokens: { input: number; output: number; total: number };
  costUsd: number;
  toolCalls: TraceToolCall[];
}

export interface Trace {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  model: string;
  totals: {
    durationMs: number;
    tokens: { input: number; output: number; total: number };
    costUsd: number;
    steps: number;
    toolCalls: number;
  };
  steps: TraceStep[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.0001) return '<$0.0001';
  return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ToolCallDetailProps {
  tool: TraceToolCall;
}

/**
 * Collapsible card showing a single tool call's input, output, and timing.
 */
function ToolCallDetail({ tool }: ToolCallDetailProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        marginTop: '0.5rem',
        border: '1px solid var(--border)',
        borderRadius: '0.375rem',
        overflow: 'hidden',
      }}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          background: 'var(--surface-2)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--foreground)',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-mono)',
          gap: '0.5rem',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              padding: '0.125rem 0.375rem',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              borderRadius: '0.25rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            TOOL
          </span>
          <span>{tool.name}</span>
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }}>
          {fmt(tool.durationMs)}&nbsp;{open ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div
          style={{
            padding: '0.75rem',
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
          }}
        >
          {/* Input */}
          <div>
            <div
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                marginBottom: '0.25rem',
              }}
            >
              INPUT
            </div>
            <pre
              style={{
                margin: 0,
                padding: '0.5rem',
                background: 'var(--surface-2)',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--foreground)',
                overflow: 'auto',
                maxHeight: '8rem',
              }}
            >
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {tool.output !== null && tool.output !== undefined && (
            <div>
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  marginBottom: '0.25rem',
                }}
              >
                OUTPUT
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '0.5rem',
                  background: 'var(--surface-2)',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--success)',
                  overflow: 'auto',
                  maxHeight: '8rem',
                }}
              >
                {JSON.stringify(tool.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TraceViewer ───────────────────────────────────────────────────────────────

interface TraceViewerProps {
  trace: Trace;
}

/**
 * Full detail view for a single trace.
 *
 * Layout:
 *   1. Stat cards  — duration, cost, token totals, step count
 *   2. Waterfall   — relative-width bars showing per-step latency
 *   3. Step list   — expandable cards with tokens, cost, and tool calls
 */
export function TraceViewer({ trace }: TraceViewerProps) {
  const maxStepMs = Math.max(...trace.steps.map((s) => s.durationMs), 1);

  return (
    <div style={{ color: 'var(--foreground)', fontFamily: 'var(--font-sans)' }}>
      {/* ── 1. Summary stat cards ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        {[
          { label: 'Total Duration', value: fmt(trace.totals.durationMs) },
          {
            label: 'Estimated Cost',
            value: fmtCost(trace.totals.costUsd),
          },
          {
            label: 'Tokens',
            value: `${fmtTokens(trace.totals.tokens.input)} in / ${fmtTokens(trace.totals.tokens.output)} out`,
          },
          {
            label: 'Steps / Tools',
            value: `${trace.totals.steps} steps · ${trace.totals.toolCalls} calls`,
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--surface-2)',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                marginBottom: '0.25rem',
              }}
            >
              {label.toUpperCase()}
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── 2. Latency waterfall ──────────────────────────────────────────── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h3
          style={{
            margin: '0 0 0.625rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.04em',
          }}
        >
          LATENCY WATERFALL
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {trace.steps.map((step) => (
            <div key={step.index} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Step label */}
              <div
                style={{
                  width: '2.25rem',
                  textAlign: 'right',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                S{step.index + 1}
              </div>

              {/* Bar track */}
              <div
                style={{
                  flex: 1,
                  height: '1.25rem',
                  background: 'var(--surface-2)',
                  borderRadius: '0.25rem',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(step.durationMs / maxStepMs) * 100}%`,
                    height: '100%',
                    /* Purple for steps with tool calls, blue for text-only steps */
                    background: step.toolCalls.length > 0 ? 'var(--primary)' : 'var(--info)',
                    opacity: 0.8,
                    minWidth: '2px',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>

              {/* Duration label */}
              <div
                style={{
                  width: '3.5rem',
                  textAlign: 'right',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fmt(step.durationMs)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Step-by-step breakdown ─────────────────────────────────────── */}
      <section>
        <h3
          style={{
            margin: '0 0 0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.04em',
          }}
        >
          STEPS
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {trace.steps.map((step) => (
            <div
              key={step.index}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                overflow: 'hidden',
              }}
            >
              {/* Step header row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.625rem 0.875rem',
                  background: 'var(--surface-2)',
                  borderBottom:
                    step.toolCalls.length > 0 || step.text ? '1px solid var(--border)' : 'none',
                }}
              >
                {/* Left: index + type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '1.375rem',
                      height: '1.375rem',
                      background: 'var(--surface-3)',
                      borderRadius: '50%',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {step.index + 1}
                  </span>
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {step.type}
                  </span>
                </div>

                {/* Right: token counts, cost, duration */}
                <div
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span title={`${step.tokens.input} input tokens`}>
                    ↑&nbsp;{fmtTokens(step.tokens.input)}
                  </span>
                  <span title={`${step.tokens.output} output tokens`}>
                    ↓&nbsp;{fmtTokens(step.tokens.output)}
                  </span>
                  <span title="Estimated cost">{fmtCost(step.costUsd)}</span>
                  <span title="Step duration">{fmt(step.durationMs)}</span>
                </div>
              </div>

              {/* Step body: text preview + tool calls */}
              {(step.text || step.toolCalls.length > 0) && (
                <div
                  style={{
                    padding: '0.75rem 0.875rem',
                    background: 'var(--surface)',
                  }}
                >
                  {/* Text preview (up to 3 lines) */}
                  {step.text && (
                    <p
                      style={
                        {
                          margin: step.toolCalls.length > 0 ? '0 0 0.625rem' : '0',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                        } as React.CSSProperties
                      }
                    >
                      {step.text}
                    </p>
                  )}

                  {/* Tool calls */}
                  {step.toolCalls.map((tool) => (
                    <ToolCallDetail key={tool.id} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
