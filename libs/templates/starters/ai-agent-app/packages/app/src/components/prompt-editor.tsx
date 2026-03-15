/**
 * PromptEditor — Editable prompt template with variable substitution and a live preview.
 *
 * Features:
 *   - Monospace textarea for editing the prompt body
 *   - Token count estimate (1 token ≈ 4 characters, English prose average)
 *   - `{{variableName}}` placeholder detection with inline input fields
 *   - Live substitution preview (replaces placeholders with current values)
 *   - Model selector (passed in from the parent)
 *   - Save button with loading state
 *
 * Usage:
 *   <PromptEditor
 *     content={editedContent}
 *     onChange={setEditedContent}
 *     onSave={handleSave}
 *     isSaving={isSaving}
 *     model={selectedModel}
 *     onModelChange={setSelectedModel}
 *     variables={variableValues}
 *     onVariableChange={handleVariableChange}
 *   />
 */

import { useState, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptEditorProps {
  /** Editable prompt body (everything after the YAML frontmatter delimiter). */
  content: string;
  /** Called on every keystroke inside the textarea. */
  onChange: (content: string) => void;
  /** Called when the user clicks the "Save" button. */
  onSave: () => void;
  /** Disables the Save button and shows a spinner-like label while true. */
  isSaving: boolean;
  /** Currently selected model ID displayed in the model selector. */
  model: string;
  /** Called when the user picks a different model from the selector. */
  onModelChange: (model: string) => void;
  /** Current values for each `{{variable}}` placeholder (name → current value). */
  variables: Record<string, string>;
  /** Called whenever a variable input field changes. */
  onVariableChange: (name: string, value: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Models shown in the selector dropdown. Extend this list as needed. */
const SUPPORTED_MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-3-5', label: 'Claude Haiku 3.5' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rough token count estimate.
 *
 * English prose averages ~4 characters per token.  This estimate is useful for
 * a ballpark figure in the UI — for an exact count, call the tokenizer API.
 */
function estimateTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4));
}

/**
 * Extract all unique `{{variableName}}` placeholder names from a string.
 * Returns them in alphabetical order so the variable panel is stable.
 */
function extractPlaceholders(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (m[1]) seen.add(m[1]);
  }
  return Array.from(seen).sort();
}

/**
 * Replace all `{{name}}` placeholders in `template` with the corresponding
 * value from `vars`.  Unmatched placeholders are left as-is.
 */
export function applyVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => vars[name] ?? _match);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PromptEditor({
  content,
  onChange,
  onSave,
  isSaving,
  model,
  onModelChange,
  variables,
  onVariableChange,
}: PromptEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  const placeholders = useMemo(() => extractPlaceholders(content), [content]);
  const tokenCount = useMemo(() => estimateTokens(content), [content]);
  const preview = useMemo(() => applyVariables(content, variables), [content, variables]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          flexWrap: 'wrap',
          backgroundColor: 'var(--surface)',
        }}
      >
        {/* Model selector */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
          }}
        >
          Model
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            style={{
              padding: '3px 6px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {SUPPORTED_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Token count estimate */}
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            marginLeft: 2,
          }}
          title="Rough estimate: 1 token ≈ 4 characters"
        >
          ~{tokenCount.toLocaleString()} tokens
        </span>

        <div style={{ flex: 1 }} />

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          style={{
            padding: '3px 10px',
            background: showPreview ? 'var(--primary)' : 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: showPreview ? 'var(--primary-foreground)' : 'var(--text-secondary)',
            fontSize: '0.75rem',
            cursor: 'pointer',
            transition: 'background 0.1s, color 0.1s',
          }}
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>

        {/* Save button */}
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          style={{
            padding: '3px 12px',
            background: isSaving ? 'var(--surface-3)' : 'var(--primary)',
            border: 'none',
            borderRadius: 4,
            color: isSaving ? 'var(--text-muted)' : 'var(--primary-foreground)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.7 : 1,
            transition: 'background 0.1s, opacity 0.1s',
          }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ── Variable inputs ──────────────────────────────────────────────── */}
      {placeholders.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            flexWrap: 'wrap',
            backgroundColor: 'var(--surface)',
          }}
        >
          <span
            style={{
              fontSize: '0.625rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            Variables
          </span>

          {placeholders.map((name) => (
            <label
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.75rem',
              }}
            >
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  background: 'var(--surface-2)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  color: 'var(--primary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {`{{${name}}}`}
              </code>
              <input
                type="text"
                value={variables[name] ?? ''}
                onChange={(e) => onVariableChange(name, e.target.value)}
                placeholder={name}
                style={{
                  padding: '3px 7px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  width: 130,
                  outline: 'none',
                }}
              />
            </label>
          ))}
        </div>
      )}

      {/* ── Editor / Preview ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {showPreview ? (
          /* Substituted preview in monospace */
          <pre
            style={{
              margin: 0,
              padding: '12px 16px',
              height: '100%',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              lineHeight: 1.65,
              color: 'var(--foreground)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'var(--surface)',
              boxSizing: 'border-box',
            }}
          >
            {preview || (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Nothing to preview yet. Start typing in the editor.
              </span>
            )}
          </pre>
        ) : (
          /* Raw editing textarea */
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            placeholder={
              'Enter your prompt template here…\n\n' +
              'Use {{variable_name}} for substitutable placeholders.\n' +
              'Example: "You are an expert {{language}} developer."'
            }
            style={{
              width: '100%',
              height: '100%',
              padding: '12px 16px',
              background: 'var(--background)',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              lineHeight: 1.65,
              color: 'var(--foreground)',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>
    </div>
  );
}
