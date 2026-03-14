import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Set your production URL here for sitemap generation and canonical links
  site: 'https://yourname.dev',

  // Static output — works great with Cloudflare Pages, Netlify, Vercel
  output: 'static',

  integrations: [
    // React is used for interactive islands (e.g. contact form, mobile menu)
    react(),

    // Generates /sitemap-index.xml automatically
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
