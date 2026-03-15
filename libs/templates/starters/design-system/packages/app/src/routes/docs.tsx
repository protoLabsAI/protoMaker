/**
 * DocsRoute — /docs
 *
 * Auto-generated component documentation page.
 *
 * For each component discovered via `*.stories.tsx` files, this route renders:
 *  - A props table (auto-generated from `argTypes`)
 *  - Usage examples (live component embeds + code snippets)
 *  - Design token references (from `argTypes` with `control: 'color'`)
 *  - Accessibility notes (inferred from component name / argType descriptions)
 *  - Related components (inferred from story category grouping)
 *  - Markdown rendering for custom `parameters.docs.description`
 *
 * Integrating into your app:
 *  Add a simple route toggle (e.g. URL hash, nav link) that renders either
 *  `<PlaygroundRoute />` or `<DocsRoute />`.
 *
 *  Example in main.tsx:
 *  ```tsx
 *  const route = window.location.hash === '#docs' ? 'docs' : 'playground';
 *  createRoot(root).render(
 *    route === 'docs' ? <DocsRoute /> : <PlaygroundRoute />
 *  );
 *  ```
 */

import React, { useMemo, useState } from 'react';
import { PropsTable } from '../components/docs/props-table';
import { UsageExample } from '../components/docs/usage-example';
import type { ArgType, StoryEntry, StoryMeta } from '../components/playground/types';

// ─── Story discovery (mirrors playground.tsx) ─────────────────────────────────

type StoryModule = { default: StoryMeta } & Record<
  string,
  { args?: Record<string, unknown>; name?: string } | StoryMeta
>;
const storyModules = import.meta.glob<StoryModule>('../**/*.stories.tsx', { eager: true });

// ─── ComponentDoc ─────────────────────────────────────────────────────────────

/** Aggregated documentation for one component (may have multiple stories). */
interface ComponentDoc {
  componentName: string;
  category: string;
  title: string;
  description?: string;
  argTypes: Record<string, ArgType>;
  stories: StoryEntry[];
  designTokens: DesignToken[];
  accessibilityNotes: string[];
  relatedComponents: string[];
}

interface DesignToken {
  name: string;
  label: string;
  category: 'color' | 'spacing' | 'typography' | 'other';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Classify a prop name / description into a design token category. */
function classifyTokenCategory(name: string): DesignToken['category'] {
  const lower = name.toLowerCase();
  if (
    lower.includes('color') ||
    lower.includes('bg') ||
    lower.includes('background') ||
    lower.includes('text') ||
    lower.includes('border')
  )
    return 'color';
  if (
    lower.includes('size') ||
    lower.includes('spacing') ||
    lower.includes('gap') ||
    lower.includes('radius') ||
    lower.includes('padding')
  )
    return 'spacing';
  if (lower.includes('font') || lower.includes('weight') || lower.includes('line-height'))
    return 'typography';
  return 'other';
}

/** Extract design token references from argTypes (color controls = token references). */
function extractDesignTokens(argTypes: Record<string, ArgType>): DesignToken[] {
  return Object.entries(argTypes)
    .filter(([, arg]) => arg.control === 'color')
    .map(([name, arg]) => ({
      name,
      label: arg.description ?? name,
      category: classifyTokenCategory(arg.description ?? name),
    }));
}

/** Infer accessibility notes based on the component name. */
function inferA11yNotes(componentName: string, argTypes: Record<string, ArgType>): string[] {
  const name = componentName.toLowerCase();
  const notes: string[] = [];

  if (name.includes('button')) {
    notes.push('Use a descriptive label that communicates the action to screen readers.');
    notes.push('Ensure visible focus styles meeting WCAG 2.4.11 (3:1 contrast ratio).');
  }
  if (name.includes('input') || name.includes('field') || name.includes('textarea')) {
    notes.push('Associate with a visible <label> using matching `htmlFor`/`id` attributes.');
    notes.push('Surface validation errors via `aria-describedby`.');
  }
  if (name.includes('modal') || name.includes('dialog')) {
    notes.push('Trap keyboard focus inside the dialog while open.');
    notes.push('Return focus to the trigger element on close.');
  }
  if (name.includes('nav') || name.includes('menu')) {
    notes.push('Use an appropriate landmark role (`<nav>` or `role="navigation"`).');
    notes.push('Indicate the active item with `aria-current="page"`.');
  }
  if (name.includes('icon') || name.includes('image') || name.includes('avatar')) {
    notes.push('Decorative icons should have `aria-hidden="true"`.');
    notes.push('Informative images require meaningful `alt` text.');
  }
  if (name.includes('card') || name.includes('badge') || name.includes('tag')) {
    notes.push('If the component is interactive, ensure it has a meaningful accessible name.');
  }

  // Check for `disabled` arg — common a11y concern
  if ('disabled' in argTypes) {
    notes.push(
      'Disabled state should be communicated via `aria-disabled="true"` rather than removing from tab order where possible.'
    );
  }

  if (notes.length === 0) {
    notes.push('Ensure interactive elements are keyboard-operable and screen-reader accessible.');
    notes.push('Maintain a minimum 4.5:1 text contrast ratio (WCAG AA).');
  }

  return notes;
}

// ─── Parse all stories into ComponentDoc entries ──────────────────────────────

function parseComponentDocs(modules: Record<string, StoryModule>): ComponentDoc[] {
  const byTitle = new Map<string, ComponentDoc>();

  for (const module of Object.values(modules)) {
    const meta = module.default;
    if (!meta?.title || !meta?.component) continue;

    const titleParts = meta.title.split('/');
    const componentName = titleParts[titleParts.length - 1] ?? meta.title;
    const category = titleParts.length > 1 ? (titleParts[0] ?? 'Components') : 'Components';

    // Get or create the ComponentDoc for this title
    if (!byTitle.has(meta.title)) {
      const argTypes = meta.argTypes ?? {};
      byTitle.set(meta.title, {
        componentName,
        category,
        title: meta.title,
        description: extractModuleDescription(meta),
        argTypes,
        stories: [],
        designTokens: extractDesignTokens(argTypes),
        accessibilityNotes: inferA11yNotes(componentName, argTypes),
        relatedComponents: [],
      });
    }

    const doc = byTitle.get(meta.title)!;

    // Add each named export as a story
    for (const [exportName, value] of Object.entries(module)) {
      if (exportName === 'default') continue;
      if (typeof value !== 'object' || value === null || 'component' in value) continue;

      const storyExport = value as { args?: Record<string, unknown>; name?: string };
      const defaultArgs: Record<string, unknown> = {};
      if (meta.argTypes) {
        for (const [key, argType] of Object.entries(meta.argTypes)) {
          if (argType.defaultValue !== undefined) defaultArgs[key] = argType.defaultValue;
        }
      }
      if (storyExport.args) Object.assign(defaultArgs, storyExport.args);

      doc.stories.push({
        id: `${meta.title}/${exportName}`,
        title: meta.title,
        componentName,
        category,
        storyName: storyExport.name ?? exportName,
        meta,
        story: storyExport,
        defaultArgs,
      });
    }
  }

  return Array.from(byTitle.values());
}

/** Extract the `parameters.docs.description` from a StoryMeta, if present. */
function extractModuleDescription(meta: StoryMeta): string | undefined {
  const docs = meta.parameters?.['docs'] as Record<string, unknown> | undefined;
  const desc = docs?.['description'];
  return typeof desc === 'string' ? desc : undefined;
}

// ─── Link related components (same category) ─────────────────────────────────

function linkRelatedComponents(docs: ComponentDoc[]): ComponentDoc[] {
  return docs.map((doc) => {
    const related = docs
      .filter((d) => d.title !== doc.title && d.category === doc.category)
      .map((d) => d.componentName);
    return { ...doc, relatedComponents: related };
  });
}

// ─── Simple Markdown renderer (zero deps) ────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      nodes.push(
        <pre key={i} style={preStyle}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={i} style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 4px' }}>
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={i} style={{ fontSize: 16, fontWeight: 600, margin: '16px 0 6px' }}>
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={i} style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }

    // Empty lines
    if (line.trim() === '') {
      nodes.push(<div key={i} style={{ height: 8 }} />);
      i++;
      continue;
    }

    // Paragraph with inline formatting
    nodes.push(
      <p
        key={i}
        style={{ margin: '0 0 8px', lineHeight: 1.6, color: 'var(--pg-fg-muted, #475569)' }}
      >
        {renderInline(line)}
      </p>
    );
    i++;
  }
  return <>{nodes}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('*')) parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    else
      parts.push(
        <code key={match.index} style={inlineCodeStyle}>
          {token.slice(1, -1)}
        </code>
      );
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}

// ─── Layout styles ────────────────────────────────────────────────────────────

const baseFont: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSize: 14,
};

const preStyle: React.CSSProperties = {
  background: 'var(--pg-code-bg, #f1f5f9)',
  borderRadius: 6,
  padding: '10px 14px',
  overflowX: 'auto',
  margin: '8px 0',
  fontSize: 12,
  lineHeight: 1.6,
  fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
};

const inlineCodeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
  fontSize: '0.875em',
  background: 'var(--pg-code-bg, #f1f5f9)',
  padding: '1px 4px',
  borderRadius: 4,
};

const sectionHeadStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--pg-fg-muted, #94a3b8)',
  marginBottom: 10,
  marginTop: 0,
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--pg-border, #e2e8f0)',
  margin: '28px 0',
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <p style={sectionHeadStyle}>{title}</p>
      {children}
    </section>
  );
}

function TokenBadge({ token }: { token: DesignToken }) {
  const colors: Record<DesignToken['category'], string> = {
    color: '#7c3aed',
    spacing: '#059669',
    typography: '#d97706',
    other: '#64748b',
  };
  return (
    <span
      title={token.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 9999,
        border: `1px solid ${colors[token.category]}40`,
        background: `${colors[token.category]}10`,
        color: colors[token.category],
        fontSize: 12,
        fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
        marginRight: 6,
        marginBottom: 6,
        cursor: 'default',
      }}
    >
      {token.name}
    </span>
  );
}

function A11yNote({ note, index }: { note: string; index: number }) {
  return (
    <div
      key={index}
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 6,
        fontSize: 13,
        color: 'var(--pg-fg, #334155)',
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: '#2563eb', flexShrink: 0, fontWeight: 600 }}>♿</span>
      <span>{note}</span>
    </div>
  );
}

// ─── Main docs panel ──────────────────────────────────────────────────────────

function ComponentDocPanel({ doc }: { doc: ComponentDoc }) {
  return (
    <div style={{ padding: '32px 40px', maxWidth: 860 }}>
      {/* Title */}
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          margin: '0 0 6px',
          color: 'var(--pg-fg, #0f172a)',
        }}
      >
        {doc.componentName}
      </h1>
      <span
        style={{
          display: 'inline-block',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--pg-fg-muted, #94a3b8)',
          marginBottom: 20,
        }}
      >
        {doc.category}
      </span>

      {/* Custom description (markdown) */}
      {doc.description && (
        <div style={{ marginBottom: 24, fontSize: 14 }}>{renderMarkdown(doc.description)}</div>
      )}

      <hr style={dividerStyle} />

      {/* Usage examples */}
      {doc.stories.length > 0 && (
        <Section title="Usage examples">
          {doc.stories.map((entry) => (
            <UsageExample key={entry.id} entry={entry} />
          ))}
        </Section>
      )}

      {/* Props table */}
      {Object.keys(doc.argTypes).length > 0 && (
        <Section title="Props">
          <PropsTable argTypes={doc.argTypes} />
        </Section>
      )}

      {/* Design tokens */}
      {doc.designTokens.length > 0 && (
        <Section title="Design tokens">
          <p
            style={{
              fontSize: 13,
              color: 'var(--pg-fg-muted, #64748b)',
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            This component references the following design tokens. Override them in your{' '}
            <code style={inlineCodeStyle}>tokens.css</code> to customise the appearance.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {doc.designTokens.map((token) => (
              <TokenBadge key={token.name} token={token} />
            ))}
          </div>
        </Section>
      )}

      {/* Accessibility notes */}
      {doc.accessibilityNotes.length > 0 && (
        <Section title="Accessibility">
          {doc.accessibilityNotes.map((note, i) => (
            <A11yNote key={i} note={note} index={i} />
          ))}
        </Section>
      )}

      {/* Related components */}
      {doc.relatedComponents.length > 0 && (
        <Section title="Related components">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {doc.relatedComponents.map((name) => (
              <span
                key={name}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--pg-border, #e2e8f0)',
                  fontSize: 13,
                  color: 'var(--pg-fg, #334155)',
                  background: 'var(--pg-sidebar, #f8fafc)',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--pg-fg-muted, #94a3b8)',
        gap: 12,
        padding: 40,
      }}
    >
      <span style={{ fontSize: 40 }}>📖</span>
      <p style={{ fontSize: 14, margin: 0, textAlign: 'center' }}>
        Select a component from the sidebar to view its documentation.
      </p>
    </div>
  );
}

// ─── DocsRoute ────────────────────────────────────────────────────────────────

export function DocsRoute() {
  const allDocs = useMemo(() => {
    const raw = parseComponentDocs(storyModules);
    return linkRelatedComponents(raw);
  }, []);

  const [selectedTitle, setSelectedTitle] = useState<string | null>(allDocs[0]?.title ?? null);

  const selected = allDocs.find((d) => d.title === selectedTitle) ?? null;

  // Group docs by category for sidebar
  const byCategory = useMemo(() => {
    const groups = new Map<string, ComponentDoc[]>();
    for (const doc of allDocs) {
      const existing = groups.get(doc.category) ?? [];
      existing.push(doc);
      groups.set(doc.category, existing);
    }
    return groups;
  }, [allDocs]);

  return (
    <div
      style={{
        ...baseFont,
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--pg-bg, #f8fafc)',
        color: 'var(--pg-fg, #0f172a)',
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--pg-border, #e2e8f0)',
          overflowY: 'auto',
          backgroundColor: 'var(--pg-sidebar, #fff)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--pg-border, #e2e8f0)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--pg-fg, #0f172a)' }}>
            📖 Documentation
          </div>
          <a
            href="#playground"
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = 'playground';
              window.location.reload();
            }}
            style={{
              fontSize: 11,
              color: 'var(--pg-fg-muted, #94a3b8)',
              textDecoration: 'none',
              display: 'block',
              marginTop: 4,
            }}
          >
            ← Back to Playground
          </a>
        </div>

        {/* Component list grouped by category */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {Array.from(byCategory.entries()).map(([category, docs]) => (
            <div key={category}>
              <div
                style={{
                  padding: '6px 16px 2px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--pg-fg-muted, #94a3b8)',
                }}
              >
                {category}
              </div>
              {docs.map((doc) => {
                const isSelected = doc.title === selectedTitle;
                return (
                  <button
                    key={doc.title}
                    onClick={() => setSelectedTitle(doc.title)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 16px',
                      border: 'none',
                      background: isSelected ? 'var(--pg-active-bg, #eff6ff)' : 'transparent',
                      color: isSelected ? 'var(--pg-active-fg, #2563eb)' : 'var(--pg-fg, #334155)',
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      borderRadius: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    {doc.componentName}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: 'var(--pg-bg, #fff)',
        }}
      >
        {selected ? <ComponentDocPanel doc={selected} /> : <EmptyState />}
      </main>
    </div>
  );
}
