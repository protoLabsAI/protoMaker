import { useState, useMemo } from 'react';
import type { StoryEntry } from './types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ComponentListProps {
  stories: StoryEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ComponentList({ stories, selectedId, onSelect }: ComponentListProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Group: category → componentName → stories
  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = stories.filter(
      (s) =>
        s.componentName.toLowerCase().includes(q) ||
        s.storyName.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );

    const map = new Map<string, Map<string, StoryEntry[]>>();
    for (const story of filtered) {
      if (!map.has(story.category)) map.set(story.category, new Map());
      const catMap = map.get(story.category)!;
      if (!catMap.has(story.componentName)) catMap.set(story.componentName, []);
      catMap.get(story.componentName)!.push(story);
    }
    return map;
  }, [stories, search]);

  const toggleCategory = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ── */}
      <div
        style={{
          padding: '12px 16px 10px',
          borderBottom: '1px solid var(--pg-border, #e2e8f0)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--pg-muted, #64748b)',
            marginBottom: 8,
          }}
        >
          Playground
        </div>
        <input
          type="search"
          aria-label="Search components"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '5px 10px',
            border: '1px solid var(--pg-border, #e2e8f0)',
            borderRadius: 6,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
            backgroundColor: 'var(--pg-input-bg, #f8fafc)',
            color: 'var(--pg-fg, #0f172a)',
          }}
        />
      </div>

      {/* ── Tree ── */}
      <nav aria-label="Component list" style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {grouped.size === 0 && (
          <p
            style={{
              padding: '16px',
              fontSize: 13,
              color: 'var(--pg-muted, #64748b)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            {search
              ? 'No stories match your search.'
              : 'No stories found.\nCreate a *.stories.tsx file.'}
          </p>
        )}

        {Array.from(grouped.entries()).map(([category, components]) => {
          const isCollapsed = collapsed.has(category);
          return (
            <div key={category}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category)}
                aria-expanded={!isCollapsed}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  width: '100%',
                  padding: '5px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'var(--pg-muted, #94a3b8)',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 9,
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                    lineHeight: 1,
                  }}
                >
                  ▾
                </span>
                {category}
              </button>

              {!isCollapsed &&
                Array.from(components.entries()).map(([name, entries]) => (
                  <ComponentGroup
                    key={name}
                    name={name}
                    entries={entries}
                    selectedId={selectedId}
                    onSelect={onSelect}
                  />
                ))}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Component group (single-story vs multi-story) ────────────────────────────

interface ComponentGroupProps {
  name: string;
  entries: StoryEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ComponentGroup({ name, entries, selectedId, onSelect }: ComponentGroupProps) {
  const [open, setOpen] = useState(true);

  // Single story → show as flat item using component name as label
  if (entries.length === 1) {
    const entry = entries[0]!;
    return (
      <StoryItem
        entry={entry}
        selected={entry.id === selectedId}
        onSelect={onSelect}
        indent={28}
        label={name}
      />
    );
  }

  // Multiple stories → collapsible group
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          width: '100%',
          padding: '5px 16px 5px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--pg-fg, #0f172a)',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontSize: 9,
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s',
            lineHeight: 1,
          }}
        >
          ▾
        </span>
        {name}
      </button>

      {open &&
        entries.map((entry) => (
          <StoryItem
            key={entry.id}
            entry={entry}
            selected={entry.id === selectedId}
            onSelect={onSelect}
            indent={38}
            label={entry.storyName}
          />
        ))}
    </div>
  );
}

// ─── Individual story item ────────────────────────────────────────────────────

interface StoryItemProps {
  entry: StoryEntry;
  selected: boolean;
  onSelect: (id: string) => void;
  indent: number;
  label: string;
}

function StoryItem({ entry, selected, onSelect, indent, label }: StoryItemProps) {
  return (
    <button
      onClick={() => onSelect(entry.id)}
      title={`${entry.title} / ${entry.storyName}`}
      aria-current={selected ? 'true' : undefined}
      style={{
        display: 'block',
        width: '100%',
        padding: `5px 16px 5px ${indent}px`,
        background: selected ? 'var(--pg-selected-bg, #eff6ff)' : 'none',
        borderLeft: `2px solid ${selected ? 'var(--pg-accent, #3b82f6)' : 'transparent'}`,
        border: 'none',
        borderRadius: 0,
        cursor: 'pointer',
        fontSize: 13,
        color: selected ? 'var(--pg-accent, #3b82f6)' : 'var(--pg-item-fg, #374151)',
        textAlign: 'left',
        fontWeight: selected ? 600 : 400,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: '1.4',
        transition: 'background 0.1s',
      }}
    >
      {label}
    </button>
  );
}
