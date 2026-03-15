/**
 * PromptsPage — Git-versioned prompt template playground.
 *
 * Layout:
 *   Left sidebar  — scrollable list of available prompt templates
 *   Right panel   — vertically split:
 *     Top ~45%    — PromptEditor (edit body, set variables, pick model, save)
 *     Bottom ~55% — Live test chat (streams a real response from POST /api/chat)
 *
 * Data flow:
 *   Load  → GET /api/prompts             (list from filesystem)
 *   Edit  → local state                  (content, variables, model)
 *   Save  → PUT /api/prompts/:id         (writes body back to the .md file)
 *   Test  → POST /api/chat               (system = substituted prompt content)
 *
 * Streaming:
 *   The test chat reads the Vercel AI SDK UI message stream and parses
 *   `0:"text chunk"` lines to reconstruct the assistant reply in real-time.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { PromptEditor, applyVariables } from '../components/prompt-editor.js';

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/prompts')({
  component: PromptsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptFile {
  id: string;
  name: string;
  description: string;
  variables: string[];
  content: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── PromptsPage ──────────────────────────────────────────────────────────────

function PromptsPage() {
  // ── Prompt list state ────────────────────────────────────────────────────
  const [prompts, setPrompts] = useState<PromptFile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // ── Selected prompt state ────────────────────────────────────────────────
  const [selected, setSelected] = useState<PromptFile | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Model and variable state ─────────────────────────────────────────────
  const [model, setModel] = useState('claude-opus-4-6');
  const [variables, setVariables] = useState<Record<string, string>>({});

  // ── Chat test state ──────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load prompt list ─────────────────────────────────────────────────────

  const fetchPrompts = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/prompts');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as PromptFile[];
      setPrompts(data);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrompts();
  }, [fetchPrompts]);

  // ── Auto-scroll chat to bottom ───────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Select a prompt ──────────────────────────────────────────────────────

  const handleSelect = (p: PromptFile) => {
    setSelected(p);
    setEditContent(p.content);
    setVariables({});
    setMessages([]);
    setSaveError(null);
    setSaveSuccess(false);
    setStreamError(null);
  };

  // ── Save prompt ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/prompts/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Server returned ${res.status}`);
      }

      const updated = (await res.json()) as PromptFile;
      setSelected(updated);
      setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Send test message ────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!userInput.trim() || isStreaming) return;

    // Apply variable substitutions to get the resolved system prompt
    const systemPrompt = applyVariables(editContent, variables);

    // Build the updated message list to send
    const userMsg: ChatMessage = { role: 'user', content: userInput.trim() };
    const historyWithUser = [...messages, userMsg];

    setMessages(historyWithUser);
    setUserInput('');
    setIsStreaming(true);
    setStreamError(null);

    // Optimistically append an empty assistant bubble to stream into
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    // Create an AbortController so the user can cancel in-flight requests
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: historyWithUser.map((m) => ({ role: m.role, content: m.content })),
          model,
          system: systemPrompt || undefined,
          maxSteps: 3,
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      if (!res.body) throw new Error('No response body from server');

      // Stream the Vercel AI SDK UI message stream.
      // Text deltas arrive as lines prefixed with `0:`, e.g.:  0:"Hello, "
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('0:')) continue;
          try {
            const delta = JSON.parse(line.slice(2)) as string;
            assistantText += delta;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: assistantText };
              }
              return copy;
            });
          } catch {
            // Non-text chunk — skip silently
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // user cancelled

      setStreamError(err instanceof Error ? err.message : 'Streaming failed');
      // Remove the empty assistant bubble on error
      setMessages((prev) => {
        if (prev[prev.length - 1]?.content === '') return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStopStream = () => {
    abortRef.current?.abort();
  };

  // ── Variable change ──────────────────────────────────────────────────────

  const handleVariableChange = (name: string, value: string) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  };

  // ── Keyboard shortcut: Enter sends, Shift+Enter inserts newline ──────────

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--background)',
        color: 'var(--foreground)',
        overflow: 'hidden',
      }}
    >
      {/* ── Left sidebar: prompt list ─────────────────────────────────── */}
      <aside
        style={{
          width: '17rem',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1rem 0.875rem',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Prompts</h1>
          <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {loadingList
              ? 'Loading…'
              : `${prompts.length} template${prompts.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Error */}
        {listError && (
          <div
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(248,113,113,0.08)',
              borderBottom: '1px solid var(--border)',
              color: 'var(--error)',
              fontSize: '0.75rem',
              flexShrink: 0,
            }}
          >
            ⚠ {listError}
          </div>
        )}

        {/* Prompt list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!loadingList && prompts.length === 0 && !listError && (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.8125rem',
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📝</div>
              No prompts found.
              <br />
              <span style={{ fontSize: '0.6875rem' }}>
                Add <code style={{ fontFamily: 'var(--font-mono)' }}>.md</code> files in{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>packages/server/prompts/</code>
              </span>
            </div>
          )}

          {prompts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: selected?.id === p.id ? 'var(--surface-2)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                borderLeft:
                  selected?.id === p.id ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--foreground)',
                transition: 'background 0.1s',
              }}
            >
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                {p.name}
              </div>

              {p.description && (
                <div
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {p.description}
                </div>
              )}

              {/* Variable badges */}
              {p.variables.length > 0 && (
                <div style={{ marginTop: '0.375rem', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {p.variables.map((v) => (
                    <span
                      key={v}
                      style={{
                        fontSize: '0.625rem',
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        padding: '1px 4px',
                        color: 'var(--primary)',
                      }}
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Panel header */}
          <div
            style={{
              padding: '0.625rem 1rem',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>{selected.name}</h2>
              {selected.description && (
                <p
                  style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                >
                  {selected.description}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Save feedback */}
              {saveSuccess && (
                <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>✓ Saved</span>
              )}
              {saveError && (
                <span style={{ fontSize: '0.75rem', color: 'var(--error)' }} title={saveError}>
                  ⚠ Save failed
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setMessages([]);
                }}
                style={{
                  padding: '0.3rem 0.625rem',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* ── Split: Editor (top) + Chat test (bottom) ─────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* ── Prompt editor — top half ───────────────────────────────── */}
            <div
              style={{
                flex: '0 0 45%',
                overflow: 'hidden',
                borderBottom: '2px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <PromptEditor
                content={editContent}
                onChange={setEditContent}
                onSave={() => void handleSave()}
                isSaving={isSaving}
                model={model}
                onModelChange={setModel}
                variables={variables}
                onVariableChange={handleVariableChange}
              />
            </div>

            {/* ── Chat test area — bottom half ───────────────────────────── */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--surface)',
              }}
            >
              {/* Chat subheader */}
              <div
                style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--border)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Test Chat
                </span>

                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    style={{
                      padding: '2px 8px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-muted)',
                      fontSize: '0.6875rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                {messages.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: 'var(--text-muted)',
                      fontSize: '0.8125rem',
                      textAlign: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>💬</div>
                      Type a message to test the prompt with a live response
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          marginBottom: '0.625rem',
                          display: 'flex',
                          justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '80%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 8,
                            background: m.role === 'user' ? 'var(--primary)' : 'var(--surface-2)',
                            color:
                              m.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
                            fontSize: '0.8125rem',
                            lineHeight: 1.55,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {m.content || <span style={{ opacity: 0.4 }}>▋</span>}
                        </div>
                      </div>
                    ))}

                    {streamError && (
                      <div
                        style={{
                          padding: '0.5rem 0.75rem',
                          background: 'rgba(248,113,113,0.08)',
                          borderRadius: 6,
                          color: 'var(--error)',
                          fontSize: '0.75rem',
                          marginTop: '0.5rem',
                        }}
                      >
                        ⚠ {streamError}
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              {/* Input bar */}
              <div
                style={{
                  padding: '8px 12px',
                  borderTop: '1px solid var(--border)',
                  flexShrink: 0,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-end',
                }}
              >
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type a test message… (Enter to send, Shift+Enter for newline)"
                  disabled={isStreaming}
                  rows={2}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--foreground)',
                    fontSize: '0.8125rem',
                    resize: 'none',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: 1.4,
                    outline: 'none',
                  }}
                />

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStopStream}
                    style={{
                      padding: '7px 14px',
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-secondary)',
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!userInput.trim()}
                    style={{
                      padding: '7px 14px',
                      background: userInput.trim() ? 'var(--primary)' : 'var(--surface-2)',
                      border: 'none',
                      borderRadius: 6,
                      color: userInput.trim() ? 'var(--primary-foreground)' : 'var(--text-muted)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: userInput.trim() ? 'pointer' : 'not-allowed',
                      flexShrink: 0,
                    }}
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state — no prompt selected */
        <main
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📝</div>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              Select a template from the sidebar to start editing.
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Use <code style={{ fontFamily: 'var(--font-mono)' }}>{'{{variable}}'}</code>{' '}
              placeholders for dynamic substitution.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
