/**
 * Playground route — Ladle-inspired component workbench.
 *
 * Usage:
 *  - Create `*.stories.tsx` files anywhere under `src/`.
 *  - Each file exports a default `StoryMeta` object and named `StoryExport` objects.
 *  - The playground auto-discovers them via Vite's `import.meta.glob`.
 *
 * Example story file:
 *
 *   export default {
 *     title: 'Components/Button',
 *     component: Button,
 *     argTypes: {
 *       label: { control: 'text', defaultValue: 'Click me' },
 *       disabled: { control: 'boolean', defaultValue: false },
 *     },
 *   } satisfies StoryMeta;
 *
 *   export const Primary: StoryExport = { args: { label: 'Primary' } };
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ComponentList } from '../components/playground/component-list';
import { PreviewPanel } from '../components/playground/preview-panel';
import { PropsEditor } from '../components/playground/props-editor';
import type {
  StoryEntry,
  StoryExport,
  StoryMeta,
  Theme,
  ViewportPreset,
} from '../components/playground/types';

// Re-export types so story files can import from this module if preferred
export type { ArgType, StoryEntry, StoryExport, StoryMeta } from '../components/playground/types';

// ─── Story discovery ──────────────────────────────────────────────────────────

// Vite glob — discovers all *.stories.tsx files under src/ at build time.
// The `eager: true` flag loads them synchronously (fine for a dev tool).
type StoryModule = { default: StoryMeta } & Record<string, StoryExport | StoryMeta>;
const storyModules = import.meta.glob<StoryModule>('../**/*.stories.tsx', { eager: true });

function parseStoryModules(modules: Record<string, StoryModule>): StoryEntry[] {
  const entries: StoryEntry[] = [];

  for (const module of Object.values(modules)) {
    const meta = module.default;
    if (!meta?.title || !meta?.component) continue;

    const titleParts = meta.title.split('/');
    const componentName = titleParts[titleParts.length - 1] ?? meta.title;
    const category = titleParts.length > 1 ? (titleParts[0] ?? 'Stories') : 'Stories';

    for (const [exportName, value] of Object.entries(module)) {
      if (exportName === 'default') continue;
      // Skip anything that looks like a StoryMeta (has 'component' key)
      if (typeof value !== 'object' || value === null || 'component' in value) continue;

      const story = value as StoryExport;

      // Build default args: argType defaults merged with story.args
      const defaultArgs: Record<string, unknown> = {};
      if (meta.argTypes) {
        for (const [key, argType] of Object.entries(meta.argTypes)) {
          if (argType.defaultValue !== undefined) defaultArgs[key] = argType.defaultValue;
        }
      }
      if (story.args) Object.assign(defaultArgs, story.args);

      entries.push({
        id: `${meta.title}/${exportName}`,
        title: meta.title,
        componentName,
        category,
        storyName: story.name ?? exportName,
        meta,
        story,
        defaultArgs,
      });
    }
  }

  return entries;
}

// ─── Viewport presets ─────────────────────────────────────────────────────────

const VIEWPORTS: ViewportPreset[] = [
  { label: 'Full', width: 0, height: null },
  { label: 'Desktop', width: 1280, height: null },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Mobile', width: 390, height: 844 },
];

// ─── Playground route ─────────────────────────────────────────────────────────

export function PlaygroundRoute() {
  const stories = useMemo(() => parseStoryModules(storyModules), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const [viewport, setViewport] = useState<ViewportPreset>(VIEWPORTS[0]!);

  // Auto-select first story on mount
  useEffect(() => {
    if (stories.length > 0 && selectedId === null) {
      const first = stories[0]!;
      setSelectedId(first.id);
      setArgs(first.defaultArgs);
    }
  }, [stories, selectedId]);

  const selected = useMemo(
    () => stories.find((s) => s.id === selectedId) ?? null,
    [stories, selectedId]
  );

  const handleSelect = useCallback(
    (id: string) => {
      const entry = stories.find((s) => s.id === id);
      if (entry) {
        setSelectedId(id);
        setArgs(entry.defaultArgs);
      }
    },
    [stories]
  );

  const handleArgChange = useCallback((key: string, value: unknown) => {
    setArgs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasPropsPanel = Boolean(
    selected?.meta.argTypes && Object.keys(selected.meta.argTypes).length > 0
  );

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        backgroundColor: 'var(--pg-bg, #f8fafc)',
        color: 'var(--pg-fg, #0f172a)',
        fontSize: 14,
      }}
    >
      {/* ── Component list sidebar ── */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--pg-border, #e2e8f0)',
          overflowY: 'auto',
          backgroundColor: 'var(--pg-sidebar, #fff)',
        }}
      >
        <ComponentList stories={stories} selectedId={selectedId} onSelect={handleSelect} />
      </aside>

      {/* ── Main preview area ── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <PreviewPanel
          story={selected}
          args={args}
          theme={theme}
          viewport={viewport}
          viewports={VIEWPORTS}
          onThemeChange={setTheme}
          onViewportChange={setViewport}
        />
      </main>

      {/* ── Props editor panel ── */}
      {hasPropsPanel && (
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderLeft: '1px solid var(--pg-border, #e2e8f0)',
            overflowY: 'auto',
            backgroundColor: 'var(--pg-sidebar, #fff)',
          }}
        >
          <PropsEditor argTypes={selected!.meta.argTypes!} args={args} onChange={handleArgChange} />
        </aside>
      )}
    </div>
  );
}
