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
  kitType?: 'docs' | 'portfolio' | 'landing-page' | 'extension' | 'ai-agent-app';
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
      'Astro Starlight documentation site with Diataxis structure, Pagefind search, dark/light theme, and Cloudflare Pages CI. Includes tutorials, how-to guides, and reference pages.',
    source: 'scaffold',
    kitType: 'docs',
    techStack: ['Astro 5', 'Starlight', 'Tailwind CSS 4', 'MDX', 'Pagefind', 'Cloudflare Pages'],
    features: [
      'Diataxis sidebar structure (tutorials, guides, reference)',
      'Pagefind full-text search (automatic)',
      'protoLabs brand theme with dark/light mode',
      'Starlight sidebar auto-generation from directories',
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
  {
    id: 'ai-agent-app',
    name: 'AI Agent App',
    description:
      'Full-stack agentic chat application with a streaming React UI, Express server running an Anthropic tool-use loop, shared tool definitions (MCP/LangGraph/Express adapters), LangGraph flows, prompt registry, and Langfuse tracing.',
    source: 'scaffold',
    kitType: 'ai-agent-app',
    techStack: [
      'React 19',
      'Vite',
      'TanStack Router',
      'Express',
      'Anthropic SDK',
      'LangGraph',
      'Vercel AI SDK',
      'Langfuse',
      'Tailwind CSS 4',
    ],
    features: [
      'Streaming chat UI with tool invocation progress labels (WebSocket sideband)',
      'Server-side Anthropic agentic loop with multi-turn tool use',
      'defineSharedTool — define once, deploy to MCP, LangGraph, and Express',
      'LangGraph flow builder with linear, loop, and branching topologies',
      'Prompt registry with YAML frontmatter and {{variable}} interpolation',
      'Langfuse observability with FileTracer fallback (zero-infra dev experience)',
      'Session persistence with LRU eviction (localStorage)',
      'Slash command system with system-prompt expansion',
    ],
    category: 'ai',
    author: 'protoLabs',
  },
  {
    id: 'browser-extension',
    name: 'Browser Extension',
    description:
      'Multi-browser extension template targeting Chrome and Firefox (Manifest V3). Includes typed messaging, storage helpers, popup/options pages, and CI pipeline for both stores.',
    source: 'clone',
    repoUrl: 'https://github.com/protoLabsAI/browser-extension-template',
    techStack: [
      'WXT',
      'React 19',
      'TypeScript',
      'Tailwind CSS 4',
      'Vitest',
      'Playwright',
      'web-ext',
    ],
    features: [
      'Background service worker with typed message routing',
      'Content script scaffold',
      'Popup and Options pages (React)',
      'Type-safe browser storage wrapper',
      'Runtime permission helpers (cross-browser safe)',
      'Chrome + Firefox builds from single codebase',
      'CI/CD with build, lint, test, and zip artifacts',
      'Firefox AMO linting via web-ext',
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
