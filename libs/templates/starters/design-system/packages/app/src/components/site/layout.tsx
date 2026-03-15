/**
 * Layout — Responsive shell for the documentation site.
 *
 * Wraps a fixed sidebar and scrollable main content area.
 * On mobile (<768px) the sidebar is hidden behind a slide-in drawer
 * triggered by the hamburger button in the header.
 *
 * Theming uses the `--pg-*` CSS custom properties defined in
 * `src/styles/tokens.css` so this component inherits any theme
 * override without needing its own token layer.
 */

import { useState, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  /** Display label for this breadcrumb segment. */
  label: string;
  /** When provided the segment is rendered as a clickable button. */
  onClick?: () => void;
}

interface LayoutProps {
  /** Sidebar content — typically a <Sidebar /> component. */
  sidebar: React.ReactNode;
  /** Main content. */
  children: React.ReactNode;
  /** Optional breadcrumb trail shown in the top header. */
  breadcrumbs?: BreadcrumbItem[];
  /** Fallback title shown when no breadcrumbs are provided. */
  title?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 14,
    color: 'var(--pg-fg, #0f172a)',
    background: 'var(--pg-bg, #f8fafc)',
  } as React.CSSProperties,

  header: {
    height: 48,
    flexShrink: 0,
    borderBottom: '1px solid var(--pg-border, #e2e8f0)',
    background: 'var(--pg-toolbar, #fff)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 10,
    zIndex: 10,
  } as React.CSSProperties,

  hamburger: {
    flexShrink: 0,
    background: 'none',
    border: '1px solid var(--pg-border, #e2e8f0)',
    borderRadius: 4,
    cursor: 'pointer',
    padding: '4px 7px',
    fontSize: 14,
    color: 'var(--pg-fg, #0f172a)',
    lineHeight: 1,
  } as React.CSSProperties,

  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    overflow: 'hidden',
  } as React.CSSProperties,

  breadcrumbItem: (clickable: boolean, active: boolean): React.CSSProperties => ({
    fontSize: 13,
    color: active ? 'var(--pg-fg, #0f172a)' : 'var(--pg-fg-secondary, #475569)',
    fontWeight: active ? 600 : 400,
    opacity: active ? 1 : 0.7,
    cursor: clickable ? 'pointer' : 'default',
    background: 'none',
    border: 'none',
    padding: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 200,
  }),

  breadcrumbSep: {
    color: 'var(--pg-muted, #94a3b8)',
    fontSize: 12,
    flexShrink: 0,
    userSelect: 'none',
  } as React.CSSProperties,

  titleText: {
    fontWeight: 700,
    fontSize: 14,
    color: 'var(--pg-fg, #0f172a)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,

  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  } as React.CSSProperties,

  sidebarShell: (isMobile: boolean, open: boolean): React.CSSProperties => ({
    width: 240,
    flexShrink: 0,
    borderRight: '1px solid var(--pg-border, #e2e8f0)',
    overflowY: 'auto',
    background: 'var(--pg-sidebar, #fff)',
    display: 'flex',
    flexDirection: 'column',
    ...(isMobile
      ? {
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease',
          boxShadow: open ? '4px 0 20px rgba(0,0,0,0.15)' : 'none',
        }
      : {}),
  }),

  overlay: (visible: boolean): React.CSSProperties => ({
    display: visible ? 'block' : 'none',
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
    zIndex: 49,
    cursor: 'pointer',
  }),

  main: {
    flex: 1,
    overflow: 'auto',
    padding: '32px 48px',
  } as React.CSSProperties,
} as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

/**
 * Responsive two-column documentation layout.
 *
 * Desktop  (≥768px): Fixed sidebar + scrollable main
 * Mobile   (<768px): Collapsed sidebar as slide-in drawer with overlay
 */
export function Layout({ sidebar, children, breadcrumbs = [], title }: LayoutProps) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Track viewport width for responsive behaviour
  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const showHeader = isMobile || breadcrumbs.length > 0 || Boolean(title);

  return (
    <div style={S.shell}>
      {/* ── Top header with breadcrumbs / mobile hamburger ── */}
      {showHeader && (
        <header style={S.header}>
          {isMobile && (
            <button
              style={S.hamburger}
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? '✕' : '☰'}
            </button>
          )}

          {/* Fallback title (no breadcrumbs) */}
          {title && breadcrumbs.length === 0 && <span style={S.titleText}>{title}</span>}

          {/* Breadcrumb trail */}
          {breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" style={S.breadcrumbs}>
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <span
                    key={i}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}
                  >
                    {i > 0 && (
                      <span style={S.breadcrumbSep} aria-hidden="true">
                        ›
                      </span>
                    )}
                    {crumb.onClick && !isLast ? (
                      <button style={S.breadcrumbItem(true, isLast)} onClick={crumb.onClick}>
                        {crumb.label}
                      </button>
                    ) : (
                      <span
                        style={S.breadcrumbItem(false, isLast)}
                        aria-current={isLast ? 'page' : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </nav>
          )}
        </header>
      )}

      {/* ── Body: sidebar + main content ── */}
      <div style={S.body}>
        {/* Mobile overlay — click to close sidebar */}
        <div style={S.overlay(isMobile && sidebarOpen)} onClick={closeSidebar} aria-hidden="true" />

        {/* Sidebar shell — positions differently on mobile vs desktop */}
        <aside
          style={S.sidebarShell(isMobile, sidebarOpen)}
          aria-label="Site navigation"
          aria-hidden={isMobile && !sidebarOpen}
        >
          {sidebar}
        </aside>

        {/* Scrollable main content */}
        <main style={S.main}>{children}</main>
      </div>
    </div>
  );
}
