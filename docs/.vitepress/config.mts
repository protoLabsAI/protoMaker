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
    ...(process.env.UMAMI_WEBSITE_ID
      ? [
          [
            'script',
            {
              defer: '',
              src: process.env.UMAMI_URL || 'https://umami.proto-labs.ai/script.js',
              'data-website-id': process.env.UMAMI_WEBSITE_ID,
            },
          ] as [string, Record<string, string>],
        ]
      : []),
  ],

  // Allow dead links to: files outside docs/
  ignoreDeadLinks: [/^\.\.\//],

  themeConfig: {
    logo: '/logo.svg',

    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/getting-started/' },
      { text: 'Agents', link: '/agents/' },
      { text: 'Infra', link: '/infra/' },
      {
        text: 'More',
        items: [
          { text: 'Integrations', link: '/integrations/' },
          { text: 'Server', link: '/server/' },
          { text: 'Authority', link: '/authority/' },
          { text: 'Development', link: '/dev/' },
          { text: 'ProtoLabs', link: '/protolabs/' },
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
      ],
      '/infra/': [
        {
          text: 'Infrastructure',
          items: generateSidebar('infra', '/infra'),
        },
      ],
      '/integrations/': [
        {
          text: 'Integrations',
          items: generateSidebar('integrations', '/integrations'),
        },
      ],
      '/server/': [
        {
          text: 'Server Reference',
          items: generateSidebar('server', '/server'),
        },
      ],
      '/authority/': [
        {
          text: 'Authority System',
          items: generateSidebar('authority', '/authority'),
        },
      ],
      '/dev/': [
        {
          text: 'Development',
          items: generateSidebar('dev', '/dev'),
        },
      ],
      '/protolabs/': [
        {
          text: 'ProtoLabs',
          items: generateSidebar('protolabs', '/protolabs'),
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/proto-labs-ai/automaker' }],

    editLink: {
      pattern: 'https://github.com/proto-labs-ai/automaker/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message:
        'Powered by <a href="https://github.com/proto-labs-ai/automaker">Automaker</a> — Built with VitePress',
      copyright: 'protoLabs AI',
    },
  },
});
