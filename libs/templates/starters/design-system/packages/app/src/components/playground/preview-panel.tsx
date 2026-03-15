import React, { useRef } from 'react';
import type { StoryEntry, Theme, ViewportPreset } from './types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PreviewPanelProps {
  story: StoryEntry | null;
  args: Record<string, unknown>;
  theme: Theme;
  viewport: ViewportPreset;
  viewports: ViewportPreset[];
  onThemeChange: (theme: Theme) => void;
  onViewportChange: (viewport: ViewportPreset) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PreviewPanel({
  story,
  args,
  theme,
  viewport,
  viewports,
  onThemeChange,
  onViewportChange,
}: PreviewPanelProps) {
  const isDark = theme === 'dark';
  const isFull = viewport.width === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Toolbar ── */}
      <Toolbar
        story={story}
        theme={theme}
        viewport={viewport}
        viewports={viewports}
        isDark={isDark}
        onThemeChange={onThemeChange}
        onViewportChange={onViewportChange}
      />

      {/* ── Canvas ── */}
      <div
        role="region"
        aria-label="Component preview"
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: isFull ? 'stretch' : 'flex-start',
          justifyContent: isFull ? 'stretch' : 'center',
          padding: isFull ? 0 : 32,
          backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
        }}
      >
        {story ? (
          <PreviewCanvas
            story={story}
            args={args}
            theme={theme}
            viewport={viewport}
            isDark={isDark}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolbarProps {
  story: StoryEntry | null;
  theme: Theme;
  viewport: ViewportPreset;
  viewports: ViewportPreset[];
  isDark: boolean;
  onThemeChange: (theme: Theme) => void;
  onViewportChange: (viewport: ViewportPreset) => void;
}

function Toolbar({
  story,
  viewport,
  viewports,
  isDark,
  onThemeChange,
  onViewportChange,
}: ToolbarProps) {
  const customWidthRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderBottom: '1px solid var(--pg-border, #e2e8f0)',
        backgroundColor: 'var(--pg-toolbar, #fff)',
        flexShrink: 0,
        flexWrap: 'wrap',
        minHeight: 44,
      }}
    >
      {/* Story breadcrumb */}
      <span
        style={{
          fontSize: 13,
          color: 'var(--pg-muted, #64748b)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {story ? (
          <>
            <span style={{ opacity: 0.6 }}>{story.title}&thinsp;/</span>{' '}
            <strong style={{ color: 'var(--pg-fg, #0f172a)' }}>{story.storyName}</strong>
          </>
        ) : (
          <span style={{ fontStyle: 'italic' }}>Select a component</span>
        )}
      </span>

      {/* Viewport buttons */}
      <ViewportControls
        viewports={viewports}
        current={viewport}
        onSelect={onViewportChange}
        customWidthRef={customWidthRef}
      />

      {/* Theme toggle */}
      <button
        onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          border: '1px solid var(--pg-border, #e2e8f0)',
          borderRadius: 6,
          cursor: 'pointer',
          backgroundColor: isDark ? '#1e293b' : '#fff',
          color: isDark ? '#f8fafc' : '#374151',
          fontFamily: 'inherit',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {isDark ? '☀︎' : '☾'}&ensp;{isDark ? 'Light' : 'Dark'}
      </button>
    </div>
  );
}

// ─── Viewport controls ────────────────────────────────────────────────────────

interface ViewportControlsProps {
  viewports: ViewportPreset[];
  current: ViewportPreset;
  onSelect: (vp: ViewportPreset) => void;
  customWidthRef: React.RefObject<HTMLInputElement | null>;
}

function ViewportControls({ viewports, current, onSelect, customWidthRef }: ViewportControlsProps) {
  const [showCustom, setShowCustom] = React.useState(false);

  const handleCustomSubmit = () => {
    const raw = customWidthRef.current?.value ?? '';
    const w = parseInt(raw, 10);
    if (!isNaN(w) && w >= 200 && w <= 3840) {
      onSelect({ label: `${w}px`, width: w, height: null });
      setShowCustom(false);
    }
  };

  const btnBase: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 12,
    border: '1px solid var(--pg-border, #e2e8f0)',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.1s, color 0.1s',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {viewports.map((vp) => {
        const active = !showCustom && current.label === vp.label;
        return (
          <button
            key={vp.label}
            onClick={() => {
              setShowCustom(false);
              onSelect(vp);
            }}
            title={vp.width === 0 ? 'Full width' : `${vp.width}×${vp.height ?? 'auto'}px`}
            style={{
              ...btnBase,
              backgroundColor: active ? 'var(--pg-accent, #3b82f6)' : 'transparent',
              color: active ? '#fff' : 'var(--pg-fg, #374151)',
              fontWeight: active ? 600 : 400,
            }}
          >
            {vp.label}
          </button>
        );
      })}

      {/* Custom width */}
      <button
        onClick={() => setShowCustom((v) => !v)}
        style={{
          ...btnBase,
          backgroundColor: showCustom ? 'var(--pg-accent, #3b82f6)' : 'transparent',
          color: showCustom ? '#fff' : 'var(--pg-fg, #374151)',
        }}
      >
        ⇔
      </button>

      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            ref={customWidthRef}
            type="number"
            min={200}
            max={3840}
            placeholder="Width"
            defaultValue={current.width || 1280}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
            style={{
              width: 72,
              padding: '4px 8px',
              fontSize: 12,
              border: '1px solid var(--pg-border, #e2e8f0)',
              borderRadius: 6,
              outline: 'none',
            }}
          />
          <button
            onClick={handleCustomSubmit}
            style={{ ...btnBase, backgroundColor: 'transparent' }}
          >
            ↵
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Preview canvas ───────────────────────────────────────────────────────────

interface PreviewCanvasProps {
  story: StoryEntry;
  args: Record<string, unknown>;
  theme: Theme;
  viewport: ViewportPreset;
  isDark: boolean;
}

function PreviewCanvas({ story, args, theme, viewport, isDark }: PreviewCanvasProps) {
  const isFull = viewport.width === 0;

  return (
    <div
      style={{
        position: 'relative',
        width: isFull ? '100%' : `${viewport.width}px`,
        maxWidth: '100%',
        height: viewport.height ? `${viewport.height}px` : isFull ? '100%' : undefined,
        minHeight: isFull ? '100%' : undefined,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        boxShadow: isFull ? 'none' : '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
        borderRadius: isFull ? 0 : 8,
        overflow: 'auto',
        color: isDark ? '#f8fafc' : '#0f172a',
        flexShrink: 0,
      }}
      data-theme={theme}
    >
      {/* Viewport label */}
      {!isFull && (
        <div
          style={{
            position: 'absolute',
            top: -20,
            left: 0,
            fontSize: 11,
            color: 'var(--pg-muted, #94a3b8)',
            fontFamily: 'monospace',
            pointerEvents: 'none',
          }}
        >
          {viewport.width}
          {viewport.height ? `×${viewport.height}` : ''}px
        </div>
      )}

      {/* Component render */}
      <ComponentRenderer story={story} args={args} />
    </div>
  );
}

// ─── Component renderer (with error boundary) ─────────────────────────────────

interface ComponentRendererProps {
  story: StoryEntry;
  args: Record<string, unknown>;
}

class RenderErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            color: '#ef4444',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          <strong>Render error</strong>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function ComponentRenderer({ story, args }: ComponentRendererProps) {
  const Component = story.meta.component;
  const mergedArgs = { ...story.defaultArgs, ...args };

  return (
    <RenderErrorBoundary>
      <div style={{ padding: 24 }}>
        <Component {...mergedArgs} />
      </div>
    </RenderErrorBoundary>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 320,
        gap: 16,
        color: 'var(--pg-muted, #94a3b8)',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ fontSize: 48 }}>🧩</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--pg-fg-secondary, #64748b)' }}>
        Select a component from the sidebar
      </div>
      <div style={{ fontSize: 13, maxWidth: 320, lineHeight: 1.7 }}>
        Create{' '}
        <code
          style={{
            backgroundColor: 'var(--pg-code-bg, #f1f5f9)',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'monospace',
          }}
        >
          *.stories.tsx
        </code>{' '}
        files anywhere under <code style={{ fontFamily: 'monospace' }}>src/</code> to register your
        components.
      </div>
    </div>
  );
}
