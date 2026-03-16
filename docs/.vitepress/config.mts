import { defineConfig } from 'vitepress';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Auto-generate sidebar items from a directory of markdown files.
 * Reads .md files, extracts the first H1 as the label, and sorts alphabetically.
 * Skips README.md and index.md (those are section landing pages).
 */
function generateSidebar(dir: string, basePath: string): { text: string; link: string }[] {
  const docsRoot = path.resolve(__dirname, '..');
  const fullDir = path.join(docsRoot, dir);

  if (!fs.existsSync(fullDir)) return [];

  return fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md' && f !== 'index.md')
    .map((f) => {
      const content = fs.readFileSync(path.join(fullDir, f), 'utf-8');
      const match = content.match(/^#\s+(.+)$/m);
      const text = match ? match[1] : f.replace('.md', '');
      const link = `${basePath}/${f.replace('.md', '')}`;
      return { text, link };
    })
    .sort((a, b) => a.text.localeCompare(b.text));
}

export default defineConfig({
  title: 'protoLabs',
  description: 'AI-Native Development Agency',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    [
      'script',
      {
        defer: '',
        src: 'https://umami.proto-labs.ai/script.js',
        'data-website-id': process.env.UMAMI_WEBSITE_ID || '64973d40-7eb6-4044-816e-b2302d1025e8',
      },
    ],
  ],

  // Exclude internal and archived docs from the public build
  srcExclude: ['internal/**', 'archived/**'],

  // Dead links are now fixed — keep false to catch future link rot.
  ignoreDeadLinks: false,

  themeConfig: {
    logo: '/logo.svg',

    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/getting-started/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'Concepts', link: '/concepts/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Starter Kits', link: '/templates/' },
      {
        text: 'More',
        items: [
          { text: 'Integrations', link: '/integrations/' },
          { text: 'Self-Hosting', link: '/self-hosting/' },
          { text: 'Consulting', link: 'https://protolabs.consulting' },
        ],
      },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: generateSidebar('getting-started', '/getting-started'),
        },
      ],
      '/guides/': [
        {
          text: 'How-To Guides',
          items: generateSidebar('guides', '/guides'),
        },
      ],
      '/concepts/': [
        {
          text: 'Concepts',
          items: generateSidebar('concepts', '/concepts'),
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: generateSidebar('reference', '/reference'),
        },
      ],
      '/integrations/': [
        {
          text: 'Integrations',
          items: generateSidebar('integrations', '/integrations'),
        },
      ],
      '/self-hosting/': [
        {
          text: 'Self-Hosting',
          items: generateSidebar('self-hosting', '/self-hosting'),
        },
      ],
      '/templates/': [
        {
          text: 'Starter Kits',
          items: generateSidebar('templates', '/templates'),
        },
      ],
      '/dev/': [
        {
          text: 'Development',
          items: generateSidebar('dev', '/dev'),
        },
      ],
      '/agents/': [
        {
          text: 'Agent System',
          items: generateSidebar('agents', '/agents'),
        },
      ],
      '/server/': [
        {
          text: 'Server',
          items: generateSidebar('server', '/server'),
        },
      ],
      '/infra/': [
        {
          text: 'Infrastructure',
          items: generateSidebar('infra', '/infra'),
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/protoLabsAI/protomaker' }],

    editLink: {
      pattern: 'https://github.com/protoLabsAI/protomaker/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Built by <a href="https://protolabs.studio">protoLabs</a> — Open source on GitHub',
      copyright: '© 2024-2026 protoLabs AI',
    },
  },
});
