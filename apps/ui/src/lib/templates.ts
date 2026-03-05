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
