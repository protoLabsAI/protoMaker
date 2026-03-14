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
      { text: 'Guides', link: '/agents/' },
      { text: 'Self-Hosting', link: '/infra/' },
      {
        text: 'More',
        items: [
          { text: 'Reference', link: '/dev/' },
          { text: 'ProtoLabs', link: '/protolabs/' },
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
      '/agents/': [
        {
          text: 'Agent System',
          items: generateSidebar('agents', '/agents'),
        },
        {
          text: 'Integrations',
          items: generateSidebar('integrations', '/integrations'),
        },
        {
          text: 'Authority',
          items: generateSidebar('authority', '/authority'),
        },
      ],
      '/integrations/': [
        {
          text: 'Integrations',
          items: generateSidebar('integrations', '/integrations'),
        },
      ],
      '/authority/': [
        {
          text: 'Authority System',
          items: generateSidebar('authority', '/authority'),
        },
      ],
      '/infra/': [
        {
          text: 'Infrastructure',
          items: generateSidebar('infra', '/infra'),
        },
      ],
      '/dev/': [
        {
          text: 'Development',
          items: generateSidebar('dev', '/dev'),
        },
        {
          text: 'Server Reference',
          items: generateSidebar('server', '/server'),
        },
      ],
      '/server/': [
        {
          text: 'Server Reference',
          items: generateSidebar('server', '/server'),
        },
      ],
      '/protolabs/': [
        {
          text: 'ProtoLabs',
          items: generateSidebar('protolabs', '/protolabs'),
        },
      ],
      '/templates/': [
        {
          text: 'Templates',
          items: generateSidebar('templates', '/templates'),
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
