/**
 * @protolabsai/templates — Shared Astro component type re-exports
 *
 * Astro components (.astro) and the React island (MobileMenu.tsx) are
 * distributed as source files and imported directly in Astro projects:
 *
 *   import Nav    from '@protolabsai/templates/components/Nav.astro';
 *   import Footer from '@protolabsai/templates/components/Footer.astro';
 *   import SEO    from '@protolabsai/templates/components/SEO.astro';
 *   import Button from '@protolabsai/templates/components/Button.astro';
 *   import Badge  from '@protolabsai/templates/components/Badge.astro';
 *   import Card   from '@protolabsai/templates/components/Card.astro';
 *
 * This file exports shared TypeScript interfaces used across components so
 * consuming projects can type their own data structures.
 */

// ── Shared interfaces used across components ────────────────────────────────

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export type SocialPlatform = 'github' | 'twitter' | 'discord' | 'linkedin' | 'youtube';

export interface SocialLink {
  platform: SocialPlatform;
  href: string;
  /** Accessible label — defaults to platform name */
  label?: string;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type BadgeColor = 'default' | 'purple' | 'green' | 'yellow' | 'blue' | 'red';

export type CardGlow = 'none' | 'subtle' | 'strong';
