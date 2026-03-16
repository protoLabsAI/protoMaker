/**
 * ChatPanel — AI chat slide-out for the Design workbench.
 *
 * Provides a conversational interface to the Design, Implement, and A11y
 * agent endpoints exposed by the server.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type AgentType = 'design' | 'implement' | 'a11y';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  screenshots?: string[];
  operations?: Array<{ summary: string }>;
}

export interface ChatPanelProps {
  onClose: () => void;
  penFilePath?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const AGENT_ENDPOINTS: Record<AgentType, string> = {
  design: '/api/agents/design',
  implement: '/api/agents/implement',
  a11y: '/api/agents/a11y',
};

const AGENT_LABELS: Record<AgentType, string> = {
  design: 'Design',
  implement: 'Implement',
  a11y: 'A11y',
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const monoFont: React.CSSProperties = {
  fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
  fontSize: 12,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ChatPanel({ onClose, penFilePath }: ChatPanelProps) {
  const [agent, setAgent] = useState<AgentType>('design');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const body: Record<string, unknown> = { request: text };
      if (penFilePath) body.filePath = penFilePath;

      const res = await fetch(AGENT_ENDPOINTS[agent], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content:
          ((data as Record<string, unknown>).response as string) ??
          ((data as Record<string, unknown>).report as string) ??
          JSON.stringify(data, null, 2),
        screenshots: (data as Record<string, unknown>).screenshots as string[] | undefined,
        operations: Array.isArray((data as Record<string, unknown>).operations)
          ? (data as { operations: Array<{ type?: string; target?: string }> }).operations.map(
              (op) => ({
                summary: `${op.type ?? 'op'} on ${op.target ?? 'unknown'}`,
              })
            )
          : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [input, loading, agent, penFilePath]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--pg-surface-1)',
        borderLeft: '1px solid var(--pg-border)',
        zIndex: 1000,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--pg-fg)', fontSize: 14 }}>AI Chat</span>
        <div style={{ flex: 1 }} />

        {/* Agent selector pills */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(Object.keys(AGENT_LABELS) as AgentType[]).map((a) => (
            <button
              key={a}
              onClick={() => setAgent(a)}
              style={{
                padding: '3px 10px',
                borderRadius: 9999,
                border: 'none',
                background: agent === a ? 'var(--pg-accent)' : 'var(--pg-surface-2)',
                color: agent === a ? '#000' : 'var(--pg-muted)',
                fontWeight: agent === a ? 600 : 400,
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {AGENT_LABELS[a]}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            padding: '4px 8px',
            border: 'none',
            background: 'transparent',
            color: 'var(--pg-muted)',
            fontSize: 18,
            cursor: 'pointer',
            lineHeight: 1,
          }}
          aria-label="Close chat"
        >
          x
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--pg-muted)', textAlign: 'center', padding: 40, fontSize: 12 }}>
            Send a message to the {AGENT_LABELS[agent]} agent.
            {penFilePath && (
              <div style={{ marginTop: 8, ...monoFont, fontSize: 11 }}>Context: {penFilePath}</div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 10,
                background: msg.role === 'user' ? 'var(--pg-accent)' : 'var(--pg-surface-2)',
                color: msg.role === 'user' ? '#000' : 'var(--pg-fg)',
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}

              {/* Screenshots */}
              {msg.screenshots?.map((src, j) => (
                <img
                  key={j}
                  src={`data:image/png;base64,${src}`}
                  alt={`Screenshot ${j + 1}`}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    borderRadius: 6,
                    marginTop: 8,
                    border: '1px solid var(--pg-border)',
                  }}
                />
              ))}

              {/* Operations */}
              {msg.operations && msg.operations.length > 0 && (
                <details style={{ marginTop: 8, fontSize: 11, color: 'var(--pg-muted)' }}>
                  <summary style={{ cursor: 'pointer' }}>
                    {msg.operations.length} operation{msg.operations.length > 1 ? 's' : ''}
                  </summary>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {msg.operations.map((op, k) => (
                      <li key={k}>{op.summary}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ color: 'var(--pg-muted)', fontSize: 12, padding: '4px 0' }}>
            Thinking...
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '8px 16px',
            background: 'rgba(248,113,113,0.1)',
            color: 'var(--pg-error)',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Input */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          borderTop: '1px solid var(--pg-border)',
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask the ${AGENT_LABELS[agent]} agent...`}
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--pg-border)',
            background: 'var(--pg-input-bg)',
            color: 'var(--pg-fg)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--pg-accent)',
            color: '#000',
            fontWeight: 600,
            fontSize: 13,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
