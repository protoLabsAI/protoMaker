/**
 * Starter Kit Templates
 *
 * Define GitHub templates that users can clone when creating new projects.
 */

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  repoUrl: string;
  techStack: string[];
  features: string[];
  category: 'fullstack' | 'frontend' | 'backend' | 'ai' | 'other';
  author: string;
  isLegacy?: boolean;
}

export const starterTemplates: StarterTemplate[] = [
  {
    id: 'browser-extension',
    name: 'Browser Extension',
    description:
      'Multi-browser extension template targeting Chrome and Firefox (Manifest V3). Includes typed messaging, storage helpers, popup/options pages, and CI pipeline for both stores.',
    repoUrl: 'https://github.com/proto-labs-ai/browser-extension-template',
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
  {
    id: 'automaker-starter-kit',
    name: 'Automaker Starter Kit',
    description:
      'An online community and training platform template for aspiring full stack engineers. Master frontend and backend development, build real-world projects, and launch your software engineering career.',
    repoUrl: 'https://github.com/webdevcody/automaker-starter-kit',
    techStack: [
      'TanStack Start',
      'PostgreSQL',
      'Drizzle ORM',
      'Better Auth',
      'Tailwind CSS',
      'Radix UI',
      'Stripe',
      'AWS S3/R2',
    ],
    features: [
      'Community posts with comments and reactions',
      'User profiles and portfolios',
      'Calendar event management',
      'Direct messaging',
      'Member discovery directory',
      'Real-time notifications',
      'Classroom modules for learning',
      'Tiered subscriptions (free/basic/pro)',
      'File uploads with presigned URLs',
    ],
    category: 'fullstack',
    author: 'webdevcody',
    isLegacy: true,
  },
  {
    id: 'agentic-jumpstart',
    name: 'Agentic Jumpstart',
    description:
      'A starter template for building agentic AI applications with a pre-configured development environment including database setup, Docker support, and TypeScript configuration.',
    repoUrl: 'https://github.com/webdevcody/agentic-jumpstart-starter-kit',
    techStack: ['TypeScript', 'Vite', 'Drizzle ORM', 'Docker', 'PostCSS'],
    features: [
      'Pre-configured VS Code settings',
      'Docker Compose setup',
      'Database migrations with Drizzle',
      'Type-safe development',
      'Environment setup with .env.example',
    ],
    category: 'ai',
    author: 'webdevcody',
    isLegacy: true,
  },
  {
    id: 'full-stack-campus',
    name: 'Full Stack Campus',
    description:
      'A feature-driven development template for building community platforms. Includes authentication, Stripe payments, file uploads, and real-time features using TanStack Start.',
    repoUrl: 'https://github.com/webdevcody/full-stack-campus',
    techStack: [
      'TanStack Start',
      'PostgreSQL',
      'Drizzle ORM',
      'Better Auth',
      'Tailwind CSS',
      'Radix UI',
      'Stripe',
      'AWS S3/R2',
    ],
    features: [
      'Community posts with comments and reactions',
      'User profiles and portfolios',
      'Calendar event management',
      'Direct messaging',
      'Member discovery directory',
      'Real-time notifications',
      'Tiered subscriptions (free/basic/pro)',
      'File uploads with presigned URLs',
    ],
    category: 'fullstack',
    author: 'webdevcody',
    isLegacy: true,
  },
];

export function getTemplateById(id: string): StarterTemplate | undefined {
  return starterTemplates.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return starterTemplates.filter((t) => t.category === category);
}
