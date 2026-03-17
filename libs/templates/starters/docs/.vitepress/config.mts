import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'My Project',
  description: 'Documentation for My Project.',

  // Set your production URL for sitemap and canonical links
  // sitemap: { hostname: 'https://docs.example.com' },

  ignoreDeadLinks: false,

  themeConfig: {
    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/getting-started/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'Reference', link: '/reference/' },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/getting-started/' },
            { text: 'Quick Start', link: '/getting-started/quick-start' },
          ],
        },
      ],
      '/guides/': [
        {
          text: 'How-to Guides',
          items: [{ text: 'Add a Page', link: '/guides/add-a-page' }],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [{ text: 'Configuration', link: '/reference/configuration' }],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com' }],

    editLink: {
      pattern: 'https://github.com/your-org/your-repo/edit/main/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Built with VitePress',
    },
  },
});
