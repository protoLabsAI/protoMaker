/**
 * Search — Floating search component for documentation site content.
 *
 * Renders a text input with a keyboard-navigable dropdown list of results.
 * Results are grouped by content section (Pages / Components / Guidelines /
 * Changelog) and filtered by title, description, and body text.
 *
 * Keyboard shortcuts:
 *   ↑ / ↓   Navigate results
 *   Enter   Select highlighted result
 *   Escape  Close dropdown and blur input
 *
 * Uses `--pg-*` CSS variables for token-driven theming.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SearchSection = 'pages' | 'components' | 'guidelines' | 'changelog';

/** Minimal shape each searchable entry must satisfy. */
export interface SearchEntry {
  slug: string;
  section: SearchSection;
  /** Primary label shown in results. */
  title: string;
  /** Optional subtitle shown below the title. */
  description?: string;
  /** Raw body text used for full-text matching. */
  body?: string;
}

interface SearchResult extends SearchEntry {
  /** Brief excerpt of body text surrounding the match (only when title/description doesn't match). */
  matchContext?: string;
}

interface SearchProps {
  /** All entries to search across. */
  entries: SearchEntry[];
  /** Called when the user selects a result. */
  onSelect: (section: SearchSection, slug: string) => void;
  placeholder?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SearchSection, string> = {
  pages: 'Pages',
  components: 'Components',
  guidelines: 'Guidelines',
  changelog: 'Changelog',
};

const MAX_RESULTS = 20;
const CONTEXT_BEFORE = 20;
const CONTEXT_TOTAL = 80;

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  wrap: {
    position: 'relative',
  } as React.CSSProperties,

  inputWrap: {
    position: 'relative',
  } as React.CSSProperties,

  searchIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 13,
    opacity: 0.4,
    pointerEvents: 'none',
    userSelect: 'none',
  } as React.CSSProperties,

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 32px 8px 32px',
    fontSize: 13,
    border: '1px solid var(--pg-border, #e2e8f0)',
    borderRadius: 6,
    background: 'var(--pg-input-bg, #f8fafc)',
    color: 'var(--pg-fg, #0f172a)',
    outline: 'none',
    transition: 'border-color 0.15s',
  } as React.CSSProperties,

  clearBtn: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    opacity: 0.4,
    padding: '2px 4px',
    lineHeight: 1,
    color: 'var(--pg-fg, #0f172a)',
  } as React.CSSProperties,

  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: 'var(--pg-sidebar, #fff)',
    border: '1px solid var(--pg-border, #e2e8f0)',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
    zIndex: 100,
    overflow: 'hidden',
    maxHeight: 360,
    overflowY: 'auto',
  } as React.CSSProperties,

  sectionHeader: {
    padding: '6px 12px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'var(--pg-muted, #94a3b8)',
    background: 'var(--pg-bg, #f8fafc)',
    borderBottom: '1px solid var(--pg-border-subtle, #f1f5f9)',
    userSelect: 'none',
  } as React.CSSProperties,

  resultItem: (active: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    background: active ? 'var(--pg-selected-bg, #eff6ff)' : 'transparent',
    color: active ? 'var(--primary, #6366f1)' : 'var(--pg-fg, #0f172a)',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    boxSizing: 'border-box',
  }),

  resultTitle: {
    fontWeight: 500,
  } as React.CSSProperties,

  resultDesc: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  empty: {
    padding: '16px 12px',
    fontSize: 13,
    opacity: 0.5,
    fontStyle: 'italic',
  } as React.CSSProperties,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a short excerpt of body text surrounding the first occurrence of query. */
function extractMatchContext(body: string, query: string): string | undefined {
  if (!body || !query) return undefined;
  const idx = body.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return undefined;

  const start = Math.max(0, idx - CONTEXT_BEFORE);
  const end = Math.min(body.length, idx + query.length + CONTEXT_TOTAL - CONTEXT_BEFORE);
  let ctx = body.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) ctx = '…' + ctx;
  if (end < body.length) ctx = ctx + '…';
  return ctx.length > CONTEXT_TOTAL ? ctx.slice(0, CONTEXT_TOTAL) + '…' : ctx;
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Standalone floating search with dropdown results.
 *
 * Accepts a flat list of entries from all content sections and handles
 * filtering, grouping, keyboard navigation, and selection internally.
 */
export function Search({ entries, onSelect, placeholder = 'Search…' }: SearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Filtering ──

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return entries
      .filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description ?? '').toLowerCase().includes(q) ||
          (e.body ?? '').toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS)
      .map((e) => {
        const titleMatch = e.title.toLowerCase().includes(q);
        return {
          ...e,
          matchContext:
            !titleMatch && !(e.description ?? '').toLowerCase().includes(q)
              ? extractMatchContext(e.body ?? '', q)
              : undefined,
        };
      });
  }, [entries, query]);

  // Group by section while preserving result order
  const grouped = useMemo(() => {
    const map = new Map<SearchSection, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.section)) map.set(r.section, []);
      map.get(r.section)!.push(r);
    }
    return Array.from(map.entries());
  }, [results]);

  // ── Close on outside click ──

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // ── Handlers ──

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, -1));
        break;
      case 'Enter':
        if (activeIdx >= 0) {
          const r = results[activeIdx];
          if (r) selectResult(r);
        }
        break;
      case 'Escape':
        setOpen(false);
        setActiveIdx(-1);
        inputRef.current?.blur();
        break;
    }
  }

  const selectResult = useCallback(
    (r: SearchResult) => {
      onSelect(r.section, r.slug);
      setQuery('');
      setOpen(false);
      setActiveIdx(-1);
    },
    [onSelect]
  );

  const clearQuery = useCallback(() => {
    setQuery('');
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }, []);

  // Compute a flat sequential index for each result item across groups
  // (used to map keyboard activeIdx to grouped rendering)
  let flatIdxCounter = 0;

  return (
    <div style={S.wrap} ref={wrapRef}>
      <div style={S.inputWrap}>
        <span style={S.searchIcon} aria-hidden="true">
          ⌕
        </span>

        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-autocomplete="list"
          aria-controls="search-results-list"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={handleKeyDown}
          style={S.input}
          autoComplete="off"
        />

        {query && (
          <button style={S.clearBtn} onClick={clearQuery} aria-label="Clear search" tabIndex={-1}>
            ×
          </button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && query.trim() && (
        <div id="search-results-list" role="listbox" style={S.dropdown}>
          {results.length === 0 && <div style={S.empty}>No results for "{query}"</div>}

          {grouped.map(([sec, items]) => (
            <div key={sec}>
              <div style={S.sectionHeader}>{SECTION_LABELS[sec]}</div>
              {items.map((r) => {
                const currentIdx = flatIdxCounter++;
                const isActive = currentIdx === activeIdx;

                return (
                  <button
                    key={`${r.section}:${r.slug}`}
                    role="option"
                    aria-selected={isActive}
                    style={S.resultItem(isActive)}
                    onClick={() => selectResult(r)}
                    onMouseEnter={() => setActiveIdx(currentIdx)}
                  >
                    <div style={S.resultTitle}>{r.title}</div>
                    {(r.description ?? r.matchContext) && (
                      <div style={S.resultDesc}>{r.description ?? r.matchContext}</div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
