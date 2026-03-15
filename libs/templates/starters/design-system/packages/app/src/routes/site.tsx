/**
 * SiteRoute — public-facing documentation site.
 *
 * Reads content from the git-tracked Markdown files under content/:
 *   content/pages/       → rendered as site pages
 *   content/components/  → component documentation
 *   content/guidelines/  → design guidelines
 *   content/changelog/   → release notes
 *
 * Content is loaded at build time via Vite's import.meta.glob (?raw).
 * When TinaCMS is running, the useTina hook enables live visual editing.
 *
 * To enable visual editing:
 *   npx tinacms dev -c "vite --port 5174"  (from packages/app/)
 *   Then navigate to http://localhost:4001/admin
 */

import { useMemo, useState } from 'react';

// ─── Frontmatter parser ───────────────────────────────────────────────────────
// Zero-dependency YAML frontmatter extraction. Handles key: value pairs and
// quoted string values. Sufficient for the content schema defined in tina/schema.ts.

interface Frontmatter {
  title?: string;
  description?: string;
  order?: string;
  category?: string;
  version?: string;
  date?: string;
  type?: string;
  status?: string;
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { frontmatter: {}, body: raw };

  const yamlBlock = match[1] ?? '';
  const body = match[2] ?? '';
  const frontmatter: Record<string, string> = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) frontmatter[key] = value;
  }

  return { frontmatter: frontmatter as Frontmatter, body };
}

// ─── Minimal Markdown renderer ────────────────────────────────────────────────
// Converts a subset of Markdown to HTML for display. No external dependencies.
// Supported: headings (h1–h3), bold, italic, inline code, links, unordered lists,
// fenced code blocks, paragraphs.

function renderMarkdown(text: string): string {
  // Fenced code blocks
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code: string) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  });

  // Headings
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Inline
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphs — wrap non-block lines
  const lines = html.split('\n');
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const isBlock = /^<(h[1-6]|ul|ol|li|pre|blockquote)/.test(line);
    if (isBlock) {
      inBlock = true;
      out.push(line);
    } else if (line.trim() === '') {
      inBlock = false;
      out.push('');
    } else if (!inBlock) {
      out.push(`<p>${line}</p>`);
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

// ─── Content loading ──────────────────────────────────────────────────────────

interface ContentEntry {
  slug: string;
  frontmatter: Frontmatter;
  body: string;
  html: string;
}

type ContentSection = 'pages' | 'components' | 'guidelines' | 'changelog';

// Vite glob imports — content files are resolved relative to this source file.
// Path: packages/app/src/routes/ → ../../../../content/
const rawPages = import.meta.glob<string>('../../../../content/pages/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const rawComponents = import.meta.glob<string>('../../../../content/components/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const rawGuidelines = import.meta.glob<string>('../../../../content/guidelines/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const rawChangelog = import.meta.glob<string>('../../../../content/changelog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function loadEntries(modules: Record<string, string>): ContentEntry[] {
  return Object.entries(modules)
    .map(([path, raw]) => {
      const slug = path.split('/').pop()?.replace('.md', '') ?? 'index';
      const { frontmatter, body } = parseFrontmatter(raw);
      return { slug, frontmatter, body, html: renderMarkdown(body) };
    })
    .sort((a, b) => {
      const ao = Number(a.frontmatter.order ?? 99);
      const bo = Number(b.frontmatter.order ?? 99);
      return ao - bo;
    });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  shell: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 14,
    color: 'var(--pg-fg, #0f172a)',
    background: 'var(--pg-bg, #f8fafc)',
  } as React.CSSProperties,

  sidebar: {
    width: 240,
    flexShrink: 0,
    borderRight: '1px solid var(--pg-border, #e2e8f0)',
    overflowY: 'auto' as const,
    background: 'var(--pg-sidebar, #fff)',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,

  sidebarHeader: {
    padding: '16px 16px 8px',
    borderBottom: '1px solid var(--pg-border, #e2e8f0)',
  } as React.CSSProperties,

  siteTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: 'var(--pg-fg, #0f172a)',
    opacity: 0.5,
  } as React.CSSProperties,

  navSection: {
    padding: '8px 0',
  } as React.CSSProperties,

  navSectionLabel: {
    padding: '6px 16px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--pg-fg, #0f172a)',
    opacity: 0.4,
  } as React.CSSProperties,

  navItem: (active: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    padding: '6px 16px',
    textAlign: 'left',
    background: active ? 'var(--pg-accent, #f1f5f9)' : 'transparent',
    color: active ? 'var(--primary, #6366f1)' : 'inherit',
    fontWeight: active ? 600 : 400,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    borderRadius: 0,
  }),

  main: {
    flex: 1,
    overflow: 'auto',
    padding: '32px 48px',
    maxWidth: 800,
  } as React.CSSProperties,

  badge: (type: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background:
      type === 'stable'
        ? '#dcfce7'
        : type === 'beta'
          ? '#fef9c3'
          : type === 'deprecated'
            ? '#fee2e2'
            : type === 'major'
              ? '#fee2e2'
              : type === 'minor'
                ? '#e0f2fe'
                : '#f1f5f9',
    color:
      type === 'stable'
        ? '#166534'
        : type === 'beta'
          ? '#854d0e'
          : type === 'deprecated'
            ? '#991b1b'
            : type === 'major'
              ? '#991b1b'
              : type === 'minor'
                ? '#0c4a6e'
                : '#475569',
  }),

  empty: {
    color: 'var(--pg-fg, #0f172a)',
    opacity: 0.4,
    fontStyle: 'italic',
    padding: '32px 0',
  } as React.CSSProperties,
} as const;

// ─── Components ───────────────────────────────────────────────────────────────

function NavSection({
  label,
  entries,
  selected,
  onSelect,
}: {
  label: string;
  entries: ContentEntry[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div style={S.navSection}>
      <div style={S.navSectionLabel}>{label}</div>
      {entries.map((e) => (
        <button
          key={e.slug}
          style={S.navItem(selected === e.slug)}
          onClick={() => onSelect(e.slug)}
        >
          {e.frontmatter.title ?? e.slug}
        </button>
      ))}
    </div>
  );
}

function MarkdownContent({ html }: { html: string }) {
  return (
    <div
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        lineHeight: 1.7,
        color: 'var(--pg-fg, #0f172a)',
      }}
    />
  );
}

function PageView({ entry }: { entry: ContentEntry }) {
  return (
    <article>
      <h1 style={{ marginTop: 0, fontSize: 28, fontWeight: 700 }}>{entry.frontmatter.title}</h1>
      {entry.frontmatter.description && (
        <p style={{ fontSize: 16, opacity: 0.7, marginTop: -8, marginBottom: 24 }}>
          {entry.frontmatter.description}
        </p>
      )}
      <MarkdownContent html={entry.html} />
    </article>
  );
}

function ComponentView({ entry }: { entry: ContentEntry }) {
  return (
    <article>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{entry.frontmatter.title}</h1>
        {entry.frontmatter.status && (
          <span style={S.badge(entry.frontmatter.status)}>{entry.frontmatter.status}</span>
        )}
      </div>
      {entry.frontmatter.category && (
        <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          {entry.frontmatter.category}
        </div>
      )}
      {entry.frontmatter.description && (
        <p style={{ fontSize: 16, opacity: 0.7, marginBottom: 24 }}>
          {entry.frontmatter.description}
        </p>
      )}
      <MarkdownContent html={entry.html} />
    </article>
  );
}

function GuidelineView({ entry }: { entry: ContentEntry }) {
  return (
    <article>
      <div style={{ marginBottom: 4 }}>
        {entry.frontmatter.category && (
          <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>
            {entry.frontmatter.category}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{entry.frontmatter.title}</h1>
      </div>
      {entry.frontmatter.description && (
        <p style={{ fontSize: 16, opacity: 0.7, marginBottom: 24 }}>
          {entry.frontmatter.description}
        </p>
      )}
      <MarkdownContent html={entry.html} />
    </article>
  );
}

function ChangelogView({ entry }: { entry: ContentEntry }) {
  return (
    <article
      style={{
        marginBottom: 48,
        borderBottom: '1px solid var(--pg-border, #e2e8f0)',
        paddingBottom: 48,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>v{entry.frontmatter.version}</h2>
        {entry.frontmatter.type && (
          <span style={S.badge(entry.frontmatter.type)}>{entry.frontmatter.type}</span>
        )}
      </div>
      {entry.frontmatter.date && (
        <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 16 }}>
          {new Date(entry.frontmatter.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      )}
      <MarkdownContent html={entry.html} />
    </article>
  );
}

// ─── SiteRoute ────────────────────────────────────────────────────────────────

export function SiteRoute() {
  const pages = useMemo(() => loadEntries(rawPages as Record<string, string>), []);
  const components = useMemo(() => loadEntries(rawComponents as Record<string, string>), []);
  const guidelines = useMemo(() => loadEntries(rawGuidelines as Record<string, string>), []);
  const changelog = useMemo(() => loadEntries(rawChangelog as Record<string, string>), []);

  const [section, setSection] = useState<ContentSection>('pages');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(pages[0]?.slug ?? null);

  function selectEntry(s: ContentSection, slug: string) {
    setSection(s);
    setSelectedSlug(slug);
  }

  const currentEntries =
    section === 'pages'
      ? pages
      : section === 'components'
        ? components
        : section === 'guidelines'
          ? guidelines
          : changelog;

  const selected = currentEntries.find((e) => e.slug === selectedSlug) ?? currentEntries[0] ?? null;

  return (
    <div style={S.shell}>
      {/* ── Sidebar navigation ── */}
      <nav style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <p style={S.siteTitle}>Design System</p>
        </div>

        <NavSection
          label="Pages"
          entries={pages}
          selected={section === 'pages' ? selectedSlug : null}
          onSelect={(slug) => selectEntry('pages', slug)}
        />
        <NavSection
          label="Components"
          entries={components}
          selected={section === 'components' ? selectedSlug : null}
          onSelect={(slug) => selectEntry('components', slug)}
        />
        <NavSection
          label="Guidelines"
          entries={guidelines}
          selected={section === 'guidelines' ? selectedSlug : null}
          onSelect={(slug) => selectEntry('guidelines', slug)}
        />
        <NavSection
          label="Changelog"
          entries={changelog}
          selected={section === 'changelog' ? selectedSlug : null}
          onSelect={(slug) => selectEntry('changelog', slug)}
        />

        <div
          style={{
            marginTop: 'auto',
            padding: '16px',
            borderTop: '1px solid var(--pg-border, #e2e8f0)',
          }}
        >
          <a
            href="/admin"
            style={{ fontSize: 12, opacity: 0.5, textDecoration: 'none', color: 'inherit' }}
          >
            ✏️ Edit content
          </a>
        </div>
      </nav>

      {/* ── Main content area ── */}
      <main style={S.main}>
        {!selected && (
          <p style={S.empty}>No content found. Add Markdown files to the content/ directory.</p>
        )}

        {/* Changelog shows all entries stacked */}
        {section === 'changelog' && changelog.length > 0 && (
          <div>
            <h1 style={{ marginTop: 0, fontSize: 28, fontWeight: 700 }}>Changelog</h1>
            {changelog.map((e) => (
              <ChangelogView key={e.slug} entry={e} />
            ))}
          </div>
        )}

        {/* All other sections show the selected entry */}
        {section !== 'changelog' && selected && (
          <>
            {section === 'pages' && <PageView entry={selected} />}
            {section === 'components' && <ComponentView entry={selected} />}
            {section === 'guidelines' && <GuidelineView entry={selected} />}
          </>
        )}
      </main>
    </div>
  );
}
