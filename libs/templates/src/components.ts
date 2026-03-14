/**
 * Astro Component Templates
 *
 * Template strings for Astro components that use the protoLabs design system
 * CSS custom properties. Each function returns the string content of a component
 * file ready to be written to disk during project scaffolding.
 */

/**
 * Sticky header nav with gradient logo text and a React mobile menu island slot.
 * File: Nav.astro
 */
export function getNavComponent(): string {
  return `---
export interface Props {
  siteName?: string;
  links?: Array<{ label: string; href: string }>;
}
const { siteName = 'ProtoLabs', links = [] } = Astro.props;
---
<header class="nav">
  <div class="nav-inner">
    <a href="/" class="nav-logo">{siteName}</a>
    <nav class="nav-links" aria-label="Main navigation">
      {links.map(link => (
        <a href={link.href} class="nav-link">{link.label}</a>
      ))}
    </nav>
    <div class="nav-mobile-toggle" id="mobile-menu-toggle">
      <!-- NavMobileMenu client:load / -->
    </div>
  </div>
</header>

<style>
  .nav {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--color-surface-1);
    border-bottom: 1px solid var(--color-surface-3);
    backdrop-filter: blur(12px);
  }
  .nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.5rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .nav-logo {
    font-size: 1.25rem;
    font-weight: 700;
    background: linear-gradient(135deg, var(--color-accent), var(--color-text-primary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-decoration: none;
  }
  .nav-links {
    display: flex;
    gap: 2rem;
    align-items: center;
  }
  .nav-link {
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s;
  }
  .nav-link:hover {
    color: var(--color-accent);
  }
  @media (max-width: 768px) {
    .nav-links { display: none; }
    .nav-mobile-toggle { display: block; }
  }
  @media (min-width: 769px) {
    .nav-mobile-toggle { display: none; }
  }
</style>
`;
}

/**
 * React island for mobile menu toggle.
 * File: NavMobileMenu.tsx
 */
export function getNavMobileMenuComponent(): string {
  return `import { useState } from 'react';

interface NavMobileMenuProps {
  links?: Array<{ label: string; href: string }>;
}

export default function NavMobileMenu({ links = [] }: NavMobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isOpen ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '4rem',
          left: 0,
          right: 0,
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-surface-3)',
          padding: '1rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          {links.map(link => (
            <a
              key={link.href}
              href={link.href}
              style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
`;
}

/**
 * Configurable footer with nav links, social icons, and copyright.
 * File: Footer.astro
 */
export function getFooterComponent(): string {
  return `---
export interface Props {
  siteName?: string;
  links?: Array<{ label: string; href: string }>;
  socialLinks?: Array<{ label: string; href: string; icon: string }>;
  copyright?: string;
}
const {
  siteName = 'ProtoLabs',
  links = [],
  socialLinks = [],
  copyright = \`© \${new Date().getFullYear()} ProtoLabs. All rights reserved.\`,
} = Astro.props;
---
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <span class="footer-logo">{siteName}</span>
    </div>
    {links.length > 0 && (
      <nav class="footer-links" aria-label="Footer navigation">
        {links.map(link => (
          <a href={link.href} class="footer-link">{link.label}</a>
        ))}
      </nav>
    )}
    {socialLinks.length > 0 && (
      <div class="footer-social">
        {socialLinks.map(link => (
          <a href={link.href} aria-label={link.label} class="footer-social-link">
            <span set:html={link.icon} />
          </a>
        ))}
      </div>
    )}
    <p class="footer-copyright">{copyright}</p>
  </div>
</footer>

<style>
  .footer {
    background: var(--color-surface-1);
    border-top: 1px solid var(--color-surface-3);
    padding: 3rem 0 2rem;
  }
  .footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    align-items: center;
    text-align: center;
  }
  .footer-logo {
    font-size: 1.125rem;
    font-weight: 700;
    background: linear-gradient(135deg, var(--color-accent), var(--color-text-primary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    justify-content: center;
  }
  .footer-link {
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s;
  }
  .footer-link:hover {
    color: var(--color-accent);
  }
  .footer-social {
    display: flex;
    gap: 1rem;
  }
  .footer-social-link {
    color: var(--color-text-muted);
    transition: color 0.2s;
    display: flex;
    align-items: center;
  }
  .footer-social-link:hover {
    color: var(--color-accent);
  }
  .footer-copyright {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    margin: 0;
  }
</style>
`;
}

/**
 * SEO meta tags component — place inside <head>.
 * File: SEO.astro
 */
export function getSEOComponent(): string {
  return `---
export interface Props {
  title: string;
  description?: string;
  image?: string;
  canonical?: string;
  noindex?: boolean;
  siteName?: string;
}
const {
  title,
  description = '',
  image = '/og-image.png',
  canonical,
  noindex = false,
  siteName = 'ProtoLabs',
} = Astro.props;
const canonicalURL = canonical ?? new URL(Astro.url.pathname, Astro.site);
---
<!-- Primary -->
<title>{title} | {siteName}</title>
<meta name="description" content={description} />
{noindex && <meta name="robots" content="noindex,nofollow" />}
{canonical && <link rel="canonical" href={canonicalURL} />}

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:url" content={canonicalURL} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={image} />
<meta property="og:site_name" content={siteName} />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={image} />
`;
}

/**
 * Button component with primary/secondary/ghost variants and sm/md/lg sizes.
 * Renders as <a> when href is provided, otherwise <button>.
 * File: Button.astro
 */
export function getButtonComponent(): string {
  return `---
export interface Props {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  class?: string;
}
const {
  variant = 'primary',
  size = 'md',
  href,
  type = 'button',
  disabled = false,
  class: className = '',
} = Astro.props;
const Tag = href ? 'a' : 'button';
---
<Tag
  class:list={['btn', \`btn-\${variant}\`, \`btn-\${size}\`, className]}
  href={href}
  type={!href ? type : undefined}
  disabled={!href ? disabled : undefined}
>
  <slot />
</Tag>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: var(--font-sans);
    font-weight: 500;
    border-radius: 0.5rem;
    border: 1px solid transparent;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s;
    white-space: nowrap;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  /* Sizes */
  .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; }
  .btn-md { padding: 0.625rem 1.25rem; font-size: 0.875rem; }
  .btn-lg { padding: 0.875rem 1.75rem; font-size: 1rem; }
  /* Variants */
  .btn-primary {
    background: var(--color-accent);
    color: #fff;
    border-color: var(--color-accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
  .btn-secondary {
    background: var(--color-surface-2);
    color: var(--color-text-primary);
    border-color: var(--color-surface-3);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--color-surface-3);
  }
  .btn-ghost {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: transparent;
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--color-surface-2);
    color: var(--color-text-primary);
  }
</style>
`;
}

/**
 * Badge component with default/accent/success/warning/danger color variants.
 * File: Badge.astro
 */
export function getBadgeComponent(): string {
  return `---
export interface Props {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  class?: string;
}
const {
  variant = 'default',
  size = 'md',
  class: className = '',
} = Astro.props;
---
<span class:list={['badge', \`badge-\${variant}\`, \`badge-\${size}\`, className]}>
  <slot />
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-family: var(--font-sans);
    font-weight: 500;
    border-radius: 9999px;
    border: 1px solid transparent;
  }
  .badge-sm { padding: 0.125rem 0.5rem; font-size: 0.625rem; }
  .badge-md { padding: 0.25rem 0.75rem; font-size: 0.75rem; }
  /* Variants */
  .badge-default {
    background: var(--color-surface-2);
    color: var(--color-text-secondary);
    border-color: var(--color-surface-3);
  }
  .badge-accent {
    background: color-mix(in srgb, var(--color-accent) 15%, transparent);
    color: var(--color-accent);
    border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
  }
  .badge-success {
    background: color-mix(in srgb, #22c55e 15%, transparent);
    color: #22c55e;
    border-color: color-mix(in srgb, #22c55e 30%, transparent);
  }
  .badge-warning {
    background: color-mix(in srgb, #f59e0b 15%, transparent);
    color: #f59e0b;
    border-color: color-mix(in srgb, #f59e0b 30%, transparent);
  }
  .badge-danger {
    background: color-mix(in srgb, #ef4444 15%, transparent);
    color: #ef4444;
    border-color: color-mix(in srgb, #ef4444 30%, transparent);
  }
</style>
`;
}

/**
 * Card component with surface-2 background and accent hover glow.
 * Renders as <a> when href is provided, otherwise <div>.
 * File: Card.astro
 */
export function getCardComponent(): string {
  return `---
export interface Props {
  href?: string;
  class?: string;
}
const { href, class: className = '' } = Astro.props;
const Tag = href ? 'a' : 'div';
---
<Tag class:list={['card', className, { 'card-link': !!href }]} href={href}>
  <slot />
</Tag>

<style>
  .card {
    background: var(--color-surface-2);
    border: 1px solid var(--color-surface-3);
    border-radius: 0.75rem;
    padding: 1.5rem;
    transition: box-shadow 0.2s, border-color 0.2s;
  }
  .card-link {
    text-decoration: none;
    color: inherit;
    display: block;
    cursor: pointer;
  }
  .card:hover {
    box-shadow: 0 0 0 1px var(--color-accent),
                0 4px 24px color-mix(in srgb, var(--color-accent) 20%, transparent);
    border-color: var(--color-accent);
  }
</style>
`;
}

/**
 * Returns all Astro components as a record mapping filename to template string.
 * Suitable for iterating over when scaffolding a new project.
 */
export function getAstroComponents(): Record<string, string> {
  return {
    'Nav.astro': getNavComponent(),
    'NavMobileMenu.tsx': getNavMobileMenuComponent(),
    'Footer.astro': getFooterComponent(),
    'SEO.astro': getSEOComponent(),
    'Button.astro': getButtonComponent(),
    'Badge.astro': getBadgeComponent(),
    'Card.astro': getCardComponent(),
  };
}
