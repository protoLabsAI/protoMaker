/**
 * Sidebar — Navigation sidebar for the documentation site.
 *
 * Features:
 * - Integrated search input that filters all content sections in real time.
 * - Components grouped by atomic design category (Atoms / Molecules /
 *   Organisms / Templates / Pages) derived from frontmatter.category.
 * - Standard nav sections for Pages, Guidelines, and Changelog.
 * - TinaCMS edit link pinned to the footer.
 *
 * Uses `--pg-*` CSS variables for token-driven theming.
 */

import { useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentSection = 'pages' | 'components' | 'guidelines' | 'changelog';

export interface ContentEntry {
  slug: string;
  frontmatter: {
    title?: string;
    description?: string;
    order?: string;
    category?: string;
    version?: string;
    date?: string;
    type?: string;
    status?: string;
  };
  body: string;
  html: string;
}

export interface SidebarProps {
  pages: ContentEntry[];
  components: ContentEntry[];
  guidelines: ContentEntry[];
  changelog: ContentEntry[];
  section: ContentSection;
  selectedSlug: string | null;
  onSelect: (section: ContentSection, slug: string) => void;
  /** Controlled search query value. */
  searchQuery: string;
  /** Called when the user types in the search input. */
  onSearchChange: (query: string) => void;
}

// ─── Atomic design category ordering ─────────────────────────────────────────

const ATOMIC_ORDER = ['atoms', 'molecules', 'organisms', 'templates', 'pages'] as const;
type AtomicKey = (typeof ATOMIC_ORDER)[number];

const ATOMIC_LABELS: Record<AtomicKey, string> = {
  atoms: 'Atoms',
  molecules: 'Molecules',
  organisms: 'Organisms',
  templates: 'Templates',
  pages: 'Pages',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  } as React.CSSProperties,

  header: {
    padding: '16px 16px 12px',
    borderBottom: '1px solid var(--pg-border, #e2e8f0)',
    flexShrink: 0,
  } as React.CSSProperties,

  siteTitle: {
    margin: '0 0 12px',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: 'var(--pg-fg, #0f172a)',
    opacity: 0.5,
  } as React.CSSProperties,

  searchWrap: {
    position: 'relative',
  } as React.CSSProperties,

  searchIcon: {
    position: 'absolute',
    left: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 13,
    opacity: 0.4,
    pointerEvents: 'none',
    userSelect: 'none',
  } as React.CSSProperties,

  searchInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px 6px 28px',
    fontSize: 12,
    border: '1px solid var(--pg-border, #e2e8f0)',
    borderRadius: 6,
    background: 'var(--pg-input-bg, #f8fafc)',
    color: 'var(--pg-fg, #0f172a)',
    outline: 'none',
  } as React.CSSProperties,

  scrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
  } as React.CSSProperties,

  navSection: {
    padding: '8px 0',
  } as React.CSSProperties,

  sectionLabel: {
    padding: '6px 16px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--pg-fg, #0f172a)',
    opacity: 0.4,
  } as React.CSSProperties,

  categoryLabel: {
    padding: '4px 16px 2px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'var(--pg-muted, #94a3b8)',
  } as React.CSSProperties,

  navItem: (active: boolean, indented = false): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    padding: indented ? '5px 16px 5px 24px' : '6px 16px',
    textAlign: 'left',
    background: active ? 'var(--pg-selected-bg, #eff6ff)' : 'transparent',
    color: active ? 'var(--primary, #6366f1)' : 'inherit',
    fontWeight: active ? 600 : 400,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    borderRadius: 0,
    boxSizing: 'border-box',
  }),

  divider: {
    borderTop: '1px solid var(--pg-border-subtle, #f1f5f9)',
    margin: '4px 0',
  } as React.CSSProperties,

  footer: {
    padding: '12px 16px',
    borderTop: '1px solid var(--pg-border, #e2e8f0)',
    flexShrink: 0,
  } as React.CSSProperties,

  editLink: {
    fontSize: 12,
    opacity: 0.5,
    textDecoration: 'none',
    color: 'inherit',
  } as React.CSSProperties,

  noResults: {
    padding: '12px 16px',
    fontSize: 12,
    opacity: 0.5,
    fontStyle: 'italic',
  } as React.CSSProperties,
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavSection({
  label,
  entries,
  selectedSlug,
  activeSection,
  targetSection,
  onSelect,
}: {
  label: string;
  entries: ContentEntry[];
  selectedSlug: string | null;
  activeSection: ContentSection;
  targetSection: ContentSection;
  onSelect: (section: ContentSection, slug: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div style={S.navSection}>
      <div style={S.sectionLabel}>{label}</div>
      {entries.map((e) => (
        <button
          key={e.slug}
          style={S.navItem(activeSection === targetSection && selectedSlug === e.slug)}
          onClick={() => onSelect(targetSection, e.slug)}
        >
          {e.frontmatter.title ?? e.slug}
        </button>
      ))}
    </div>
  );
}

/**
 * Components section with atomic design category sub-grouping.
 * Categories are derived from frontmatter.category (case-insensitive).
 * Items that don't match a known atomic category fall under "Other".
 */
function ComponentsSection({
  components,
  selectedSlug,
  activeSection,
  onSelect,
}: {
  components: ContentEntry[];
  selectedSlug: string | null;
  activeSection: ContentSection;
  onSelect: (section: ContentSection, slug: string) => void;
}) {
  if (components.length === 0) return null;

  const groups = useMemo(() => {
    const map = new Map<string, ContentEntry[]>();
    for (const entry of components) {
      const cat = (entry.frontmatter.category ?? '').toLowerCase().trim();
      const key = (ATOMIC_ORDER as readonly string[]).includes(cat) ? cat : 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }

    // Return in canonical atomic design order; "other" appended last
    const result: Array<{ key: string; label: string; entries: ContentEntry[] }> = [];
    for (const key of [...ATOMIC_ORDER, 'other']) {
      const items = map.get(key);
      if (items && items.length > 0) {
        result.push({
          key,
          label: key in ATOMIC_LABELS ? ATOMIC_LABELS[key as AtomicKey] : 'Other',
          entries: items,
        });
      }
    }
    return result;
  }, [components]);

  const isMultiGroup = groups.length > 1;

  return (
    <div style={S.navSection}>
      <div style={S.sectionLabel}>Components</div>
      {groups.map((group, gi) => (
        <div key={group.key}>
          {/* Show sub-category label only when multiple atomic groups exist */}
          {isMultiGroup && <div style={S.categoryLabel}>{group.label}</div>}
          {group.entries.map((e) => (
            <button
              key={e.slug}
              style={S.navItem(
                activeSection === 'components' && selectedSlug === e.slug,
                isMultiGroup
              )}
              onClick={() => onSelect('components', e.slug)}
            >
              {e.frontmatter.title ?? e.slug}
            </button>
          ))}
          {isMultiGroup && gi < groups.length - 1 && <div style={S.divider} />}
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({
  pages,
  components,
  guidelines,
  changelog,
  section,
  selectedSlug,
  onSelect,
  searchQuery,
  onSearchChange,
}: SidebarProps) {
  const q = searchQuery.trim().toLowerCase();

  /** Filter entries by search query (title, description, body). */
  function filter(entries: ContentEntry[]): ContentEntry[] {
    if (!q) return entries;
    return entries.filter(
      (e) =>
        (e.frontmatter.title ?? e.slug).toLowerCase().includes(q) ||
        (e.frontmatter.description ?? '').toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q)
    );
  }

  const filteredPages = filter(pages);
  const filteredComponents = filter(components);
  const filteredGuidelines = filter(guidelines);
  const filteredChangelog = filter(changelog);

  const totalResults =
    filteredPages.length +
    filteredComponents.length +
    filteredGuidelines.length +
    filteredChangelog.length;

  return (
    <div style={S.sidebar}>
      {/* ── Header: site title + search ── */}
      <div style={S.header}>
        <p style={S.siteTitle}>Design System</p>
        <div style={S.searchWrap}>
          <span style={S.searchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={S.searchInput}
            aria-label="Search documentation"
          />
        </div>
      </div>

      {/* ── Scrollable navigation ── */}
      <div style={S.scrollArea}>
        {q && totalResults === 0 && <div style={S.noResults}>No results for "{searchQuery}"</div>}

        <NavSection
          label="Pages"
          entries={filteredPages}
          selectedSlug={selectedSlug}
          activeSection={section}
          targetSection="pages"
          onSelect={onSelect}
        />

        <ComponentsSection
          components={filteredComponents}
          selectedSlug={selectedSlug}
          activeSection={section}
          onSelect={onSelect}
        />

        <NavSection
          label="Guidelines"
          entries={filteredGuidelines}
          selectedSlug={selectedSlug}
          activeSection={section}
          targetSection="guidelines"
          onSelect={onSelect}
        />

        <NavSection
          label="Changelog"
          entries={filteredChangelog}
          selectedSlug={selectedSlug}
          activeSection={section}
          targetSection="changelog"
          onSelect={onSelect}
        />
      </div>

      {/* ── Footer: TinaCMS edit link ── */}
      <div style={S.footer}>
        <a href="/admin" style={S.editLink}>
          ✏️ Edit content
        </a>
      </div>
    </div>
  );
}
