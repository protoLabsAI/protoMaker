import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// To deploy as an SSR app to Cloudflare Workers/Pages Functions:
// 1. Uncomment the cloudflare import below
// 2. Change output to 'server' or 'hybrid'
// 3. Add cloudflare() to the integrations array
//
// import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // Set your production URL here for sitemap generation and canonical links
  site: "https://docs.example.com",

  // Static output is the default and works great with Cloudflare Pages
  // (just drag-and-drop the dist/ folder or connect your Git repo)
  output: "static",

  integrations: [
    starlight({
      title: "My Project",

      description: "Documentation for My Project — built with Astro Starlight.",

      social: [{ icon: "github", label: "GitHub", href: "https://github.com" }],

      // Pagefind is enabled by default — no extra configuration needed.
      // To disable: pagefind: false

      // Custom CSS for the protoLabs brand theme
      customCss: ["./src/styles/global.css"],

      // Sidebar navigation
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "tutorials" },
        },
        {
          label: "How-to Guides",
          autogenerate: { directory: "guides" },
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],

      // Starlight color theme — violet accent matching the protoLabs palette
      expressiveCode: {
        themes: ["github-dark", "github-light"],
      },
    }),

    // Generates /sitemap-index.xml and /sitemap-0.xml automatically
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
