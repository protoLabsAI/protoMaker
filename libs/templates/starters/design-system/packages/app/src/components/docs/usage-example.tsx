/**
 * UsageExample
 *
 * Renders a single story usage example with:
 *  - A live component embed (rendered with the story's default args)
 *  - A JSX code snippet showing how to use the component
 *  - A theme toggle so the embed can be previewed in dark mode
 */

import React, { useState } from 'react';
import type { StoryEntry } from '../playground/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsageExampleProps {
  entry: StoryEntry;
  /** Override args to pass to the component. Falls back to entry.defaultArgs. */
  args?: Record<string, unknown>;
}

// ─── Code snippet generation ──────────────────────────────────────────────────

/** Serialize a value as a JSX prop expression. */
function serializePropValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? '' : '{false}';
  return `{${JSON.stringify(value)}}`;
}

/** Build a JSX usage snippet from the component name and args. */
function buildCodeSnippet(componentName: string, args: Record<string, unknown>): string {
  const props = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => {
      if (typeof value === 'boolean' && value === true) return `  ${key}`;
      const serialized = serializePropValue(value);
      return `  ${key}=${serialized}`;
    });

  if (props.length === 0) return `<${componentName} />`;
  return `<${componentName}\n${props.join('\n')}\n/>`;
}

// ─── Simple markdown renderer ─────────────────────────────────────────────────
// Zero external dependencies — handles headings, bold, italic, inline code,
// code blocks, and paragraphs sufficient for story descriptions.

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      elements.push(
        <pre key={i} style={preStyle}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Headings
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h3) {
      elements.push(
        <h3 key={i} style={h3Style}>
          {h3[1]}
        </h3>
      );
      i++;
      continue;
    }
    if (h2) {
      elements.push(
        <h2 key={i} style={h2Style}>
          {h2[1]}
        </h2>
      );
      i++;
      continue;
    }
    if (h1) {
      elements.push(
        <h1 key={i} style={h1Style}>
          {h1[1]}
        </h1>
      );
      i++;
      continue;
    }

    // Empty line → spacer
    if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 8 }} />);
      i++;
      continue;
    }

    // Regular paragraph with inline formatting
    elements.push(
      <p key={i} style={pStyle}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

/** Render inline markdown: **bold**, *italic*, `code` */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(
        <code key={match.index} style={inlineCodeStyle}>
          {token.slice(1, -1)}
        </code>
      );
    }

    last = match.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));

  return parts.length === 1 ? parts[0] : parts;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const h1Style: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: '0 0 8px' };
const h2Style: React.CSSProperties = { fontSize: 15, fontWeight: 600, margin: '12px 0 6px' };
const h3Style: React.CSSProperties = { fontSize: 13, fontWeight: 600, margin: '8px 0 4px' };
const pStyle: React.CSSProperties = { margin: '0 0 6px', lineHeight: 1.6 };
const preStyle: React.CSSProperties = {
  background: 'var(--pg-code-bg, #f1f5f9)',
  borderRadius: 6,
  padding: '10px 14px',
  overflowX: 'auto',
  margin: '8px 0',
  fontSize: 12,
  lineHeight: 1.5,
  fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
};
const inlineCodeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
  fontSize: '0.875em',
  background: 'var(--pg-code-bg, #f1f5f9)',
  padding: '1px 4px',
  borderRadius: 4,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--pg-fg-muted, #64748b)',
  marginBottom: 8,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function UsageExample({ entry, args: argOverride }: UsageExampleProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const [showCode, setShowCode] = useState(false);

  const args = argOverride ?? entry.defaultArgs;
  const Component = entry.meta.component;
  const snippet = buildCodeSnippet(entry.componentName, args);

  // Description from story parameters
  const description = (entry.story.parameters?.['docs'] as Record<string, unknown> | undefined)?.[
    'description'
  ];
  const descriptionText = typeof description === 'string' ? description : undefined;

  return (
    <div
      style={{
        border: '1px solid var(--pg-border, #e2e8f0)',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--pg-border, #e2e8f0)',
          background: 'var(--pg-header-bg, #f8fafc)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pg-fg, #0f172a)' }}>
          {entry.storyName}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Theme toggle */}
          <button
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title="Toggle theme"
            style={{
              cursor: 'pointer',
              border: '1px solid var(--pg-border, #e2e8f0)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
              background: 'var(--pg-sidebar, #fff)',
              color: 'var(--pg-fg, #0f172a)',
            }}
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
          {/* Code toggle */}
          <button
            onClick={() => setShowCode((s) => !s)}
            title="Show/hide code"
            style={{
              cursor: 'pointer',
              border: '1px solid var(--pg-border, #e2e8f0)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
              background: showCode ? 'var(--pg-active-bg, #eff6ff)' : 'var(--pg-sidebar, #fff)',
              color: showCode ? 'var(--pg-active-fg, #2563eb)' : 'var(--pg-fg, #0f172a)',
            }}
          >
            {'</>'}
          </button>
        </div>
      </div>

      {/* ── Optional description ── */}
      {descriptionText && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--pg-fg-muted, #64748b)',
            borderBottom: '1px solid var(--pg-border, #e2e8f0)',
          }}
        >
          {renderMarkdown(descriptionText)}
        </div>
      )}

      {/* ── Live preview ── */}
      <div
        data-theme={theme}
        style={{
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 80,
          background: theme === 'dark' ? '#0f172a' : '#fff',
          color: theme === 'dark' ? '#f8fafc' : '#0f172a',
        }}
      >
        <Component {...(args as Record<string, unknown>)} />
      </div>

      {/* ── Code snippet ── */}
      {showCode && (
        <div style={{ borderTop: '1px solid var(--pg-border, #e2e8f0)' }}>
          <div style={{ padding: '8px 12px 0', ...sectionLabelStyle }}>Usage</div>
          <pre style={{ ...preStyle, margin: 0, borderRadius: 0 }}>
            <code>{snippet}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
