/**
 * MobileMenu — React island for the Nav component's mobile drawer.
 *
 * Used internally by Nav.astro as `<MobileMenu client:load />`.
 * Consumers should import Nav.astro rather than this component directly.
 */

import { useState, useEffect, useCallback } from 'react';

interface NavLink {
  label: string;
  href: string;
}

interface MobileMenuProps {
  links: NavLink[];
  ctaLabel?: string;
  ctaHref?: string;
}

export default function MobileMenu({ links, ctaLabel, ctaHref }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div style={styles.wrapper}>
      {/* Hamburger / close toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        style={styles.toggle}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
          style={{ display: 'block' }}
        >
          {open ? (
            // X icon
            <>
              <line
                x1="2"
                y1="2"
                x2="16"
                y2="16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="16"
                y1="2"
                x2="2"
                y2="16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          ) : (
            // Hamburger lines
            <>
              <line
                x1="1"
                y1="4"
                x2="17"
                y2="4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="1"
                y1="9"
                x2="17"
                y2="9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="1"
                y1="14"
                x2="17"
                y2="14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </button>

      {/* Mobile nav drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div style={styles.backdrop} onClick={close} aria-hidden="true" />

          {/* Drawer */}
          <nav id="mobile-nav-drawer" style={styles.drawer} aria-label="Mobile navigation">
            <ul role="list" style={styles.linkList}>
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} style={styles.link} onClick={close}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            {ctaLabel && ctaHref && (
              <div style={styles.ctaWrapper}>
                <a href={ctaHref} style={styles.cta} onClick={close}>
                  {ctaLabel}
                </a>
              </div>
            )}
          </nav>
        </>
      )}
    </div>
  );
}

// Inline styles — no CSS-in-JS dependency required
const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    marginLeft: 'auto',
  } satisfies React.CSSProperties,

  toggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#a1a1aa',
    padding: '0',
    transition: 'border-color 0.15s, color 0.15s',
    flexShrink: 0,
  } satisfies React.CSSProperties,

  backdrop: {
    position: 'fixed',
    inset: '64px 0 0 0',
    background: 'rgba(0,0,0,0.6)',
    zIndex: 48,
  } satisfies React.CSSProperties,

  drawer: {
    position: 'fixed',
    top: '64px',
    left: '0',
    right: '0',
    background: 'rgba(9,9,11,0.97)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backdropFilter: 'blur(12px)',
    padding: '16px 24px 24px',
    zIndex: 49,
  } satisfies React.CSSProperties,

  linkList: {
    listStyle: 'none',
    margin: '0',
    padding: '0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } satisfies React.CSSProperties,

  link: {
    display: 'block',
    color: '#a1a1aa',
    textDecoration: 'none',
    fontSize: '16px',
    fontWeight: '500',
    padding: '12px 16px',
    borderRadius: '8px',
  } satisfies React.CSSProperties,

  ctaWrapper: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  } satisfies React.CSSProperties,

  cta: {
    display: 'block',
    textAlign: 'center' as const,
    padding: '12px 20px',
    background: '#a78bfa',
    color: '#09090b',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    textDecoration: 'none',
  } satisfies React.CSSProperties,
} as const;
