/**
 * Starter Kit Templates
 *
 * Define starter templates for new projects. Templates can be either:
 * - `scaffold`: Local templates copied from @protolabsai/templates starters
 * - `clone`: GitHub repositories cloned via git
 */

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  /** How the template is provisioned */
  source: 'scaffold' | 'clone';
  /** Kit type for scaffold source — maps to scaffold endpoint */
  kitType?: 'docs' | 'portfolio' | 'landing-page';
  /** GitHub URL for clone source */
  repoUrl?: string;
  techStack: string[];
  features: string[];
  category: 'fullstack' | 'frontend' | 'backend' | 'ai' | 'other';
  author: string;
  isLegacy?: boolean;
}

export const starterTemplates: StarterTemplate[] = [
  {
    id: 'docs',
    name: 'Documentation Site',
    description:
      'VitePress documentation site with Diataxis structure, local search, dark/light theme, and Cloudflare Pages CI. Includes tutorials, how-to guides, and reference pages.',
    source: 'scaffold',
    kitType: 'docs',
    techStack: ['VitePress', 'Markdown', 'Cloudflare Pages'],
    features: [
      'Diataxis sidebar structure (tutorials, guides, reference)',
      'Built-in local full-text search',
      'Brand theme with dark/light mode (CSS variable overrides)',
      'Custom containers (tip, warning, danger, info)',
      'CI pipeline with build, format, lint, and deploy',
      'Markdown linting with markdownlint-cli2',
    ],
    category: 'frontend',
    author: 'protoLabs',
  },
  {
    id: 'portfolio',
    name: 'Portfolio / Marketing Site',
    description:
      'Astro portfolio site with React islands, Content Collections, View Transitions, and RSS feed. Includes project showcase, blog, testimonials, and contact form.',
    source: 'scaffold',
    kitType: 'portfolio',
    techStack: ['Astro 5', 'React 19', 'Tailwind CSS 4', 'Content Collections', 'View Transitions'],
    features: [
      'Project showcase with tag filtering (React island)',
      'Blog with MDX and RSS feed',
      'Testimonials section with JSON data',
      'Contact form with validation (React island)',
      'SEO meta tags, Open Graph, Twitter Cards',
      'View Transitions for SPA-like navigation',
    ],
    category: 'frontend',
    author: 'protoLabs',
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    description:
      'Dark-themed landing page with composable sections, CSS custom property theming, scroll animations, and Content Collections for easy customization. Includes hero, stats, features, pricing, testimonials, FAQ, and CTA sections.',
    source: 'scaffold',
    kitType: 'landing-page',
    techStack: ['Astro 5', 'Tailwind CSS 4', 'Content Collections', 'IntersectionObserver'],
    features: [
      'Composable section components (hero, stats, features, pricing, FAQ, testimonials)',
      'CSS custom property theming (rebrand by changing 6 values)',
      'Scroll-triggered fade-in animations',
      'Content Collections for all section data (edit JSON, not code)',
      'SEO meta tags, Open Graph, Twitter Cards, sitemap',
      'Geist font family (sans + mono)',
    ],
    category: 'frontend',
    author: 'protoLabs',
  },
];

export function getTemplateById(id: string): StarterTemplate | undefined {
  return starterTemplates.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return starterTemplates.filter((t) => t.category === category);
}
