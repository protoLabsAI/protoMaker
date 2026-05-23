/**
 * Starter Features
 *
 * Pre-written feature descriptions for each starter kit type.
 * These provide immediate backlog items for new projects.
 */

import type { StarterFeature, StarterKitType } from './types.js';

const UNIVERSAL_FEATURES: StarterFeature[] = [
  {
    title: 'Configure CI pipeline',
    description:
      'Set up GitHub Actions workflows for build, test, format check, and security audit. Ensure all checks run on pull requests and pushes to main.',
    complexity: 'medium',
  },
  {
    title: 'Set up branch protection',
    description:
      'Configure branch protection rules on the main branch. Require status checks (build, test, format), require PR reviews, and prevent force pushes.',
    complexity: 'small',
  },
  {
    title: 'Write project README',
    description:
      'Create a comprehensive README.md with project overview, setup instructions, development workflow, and contribution guidelines.',
    complexity: 'small',
  },
];

const DOCS_FEATURES: StarterFeature[] = [
  {
    title: 'Write your first tutorial',
    description:
      'Create a step-by-step tutorial in getting-started/ that walks a new user through the core workflow. Follow Diataxis tutorial guidelines: linear, guided, guaranteed success.',
    complexity: 'medium',
  },
  {
    title: 'Add a how-to guide',
    description:
      'Write a task-focused how-to guide in guides/. Pick the most common user task and document the steps. No explanation — just actionable steps.',
    complexity: 'small',
  },
  {
    title: 'Configure custom domain',
    description:
      'Set up a custom domain for the documentation site. Update .vitepress/config.mts with the sitemap hostname and configure DNS records.',
    complexity: 'small',
  },
  {
    title: 'Create API reference page',
    description:
      'Add a reference page in reference/ documenting the project API or configuration options. Follow Diataxis reference guidelines: complete, accurate, organized for scanning.',
    complexity: 'medium',
  },
];

const PORTFOLIO_FEATURES: StarterFeature[] = [
  {
    title: 'Customize site identity',
    description:
      'Update src/content/siteConfig/ with your name, bio, social links, and profile photo. Replace the placeholder content throughout the site with real information.',
    complexity: 'small',
  },
  {
    title: 'Add portfolio projects',
    description:
      'Populate src/content/projects/ with your real projects. Each project gets a title, description, tech stack tags, links, and an optional cover image.',
    complexity: 'small',
  },
  {
    title: 'Write blog posts',
    description:
      'Create your first blog posts in src/content/blog/. Posts are MDX and support syntax highlighting, images, and custom components.',
    complexity: 'medium',
  },
  {
    title: 'Configure custom domain',
    description:
      'Set up a custom domain for the portfolio. Update astro.config.mjs with the site URL, configure DNS records, and deploy to Cloudflare Pages.',
    complexity: 'small',
  },
  {
    title: 'Add testimonials',
    description:
      'Collect and add testimonials to src/content/testimonials/. Each testimonial includes a quote, author name, role, and optional avatar.',
    complexity: 'small',
  },
];

/**
 * Get starter features for a given kit type.
 * Returns universal features plus type-specific features.
 */
export function getStarterFeatures(type: StarterKitType): StarterFeature[] {
  switch (type) {
    case 'docs':
      return [...UNIVERSAL_FEATURES, ...DOCS_FEATURES];
    case 'portfolio':
      return [...UNIVERSAL_FEATURES, ...PORTFOLIO_FEATURES];
    case 'landing-page':
      return [...UNIVERSAL_FEATURES];
    case 'general':
      return [...UNIVERSAL_FEATURES];
  }
}

/**
 * Get only the universal features (shared across all kit types).
 */
export function getUniversalFeatures(): StarterFeature[] {
  return [...UNIVERSAL_FEATURES];
}
