# Project structure

This page covers the file layout of the docs starter kit and explains how the pieces fit together. After reading it you'll know where to add pages, how the sidebar is generated, and where to put styles and assets.

## Directory layout

```
docs-starter/
├── src/
│   ├── content/
│   │   └── docs/               ← your pages live here
│   │       ├── index.mdx       ← home page (splash template)
│   │       ├── tutorials/      ← step-by-step walkthroughs
│   │       ├── guides/         ← task-focused how-to pages
│   │       └── reference/      ← API and configuration reference
│   ├── content.config.ts       ← Astro content collection schema
│   └── styles/
│       └── global.css          ← brand theme and Starlight variable overrides
├── astro.config.mjs            ← Starlight configuration (title, sidebar, social links)
├── package.json
└── tsconfig.json
```

## Adding a page

Create a `.mdx` file anywhere inside `src/content/docs/`. It appears automatically in the sidebar — no manual list to update.

```bash
# Add a new how-to guide
touch src/content/docs/guides/deploy-to-cloudflare.mdx
```

Every page requires a frontmatter block:

```mdx
---
title: Deploy to Cloudflare Pages
description: Connect your repo to Cloudflare Pages and ship on every push.
---

Your content here.
```

`title` is required. `description` populates the `<meta>` description tag and the Pagefind search index.

## Sidebar

The sidebar in `astro.config.mjs` uses `autogenerate` to mirror each content subdirectory:

```js
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
```

Files are sorted alphabetically by default. To control order, prefix filenames with numbers: `01-getting-started.mdx`, `02-configuration.mdx`.

To add a new section, add a subdirectory under `src/content/docs/` and a matching `autogenerate` entry in the sidebar config.

## Styles

`src/styles/global.css` overrides Starlight's CSS variables to apply the protoLabs brand theme:

- `--sl-color-accent-*` — violet accent colour scale
- `--sl-color-bg-*` — surface and background colours
- `--sl-font-*` — Geist font stack

To change the theme, update the variable values in this file. Do not modify Starlight component files directly — CSS variable overrides survive Starlight version upgrades; component forks do not.

## Content collection schema

`src/content.config.ts` defines the `docs` collection using Starlight's `docsLoader` and `docsSchema`:

```ts
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
```

This is required in Astro 5. Without it, Astro falls back to deprecated auto-generated collection behaviour and emits a build warning.

## Search

Pagefind search is enabled automatically. During `npm run build`, Pagefind crawls the HTML output and writes an index to `dist/pagefind/`. No configuration is required.

To disable search, add `pagefind: false` to the Starlight config in `astro.config.mjs`.

## Deployment

The output is fully static (`output: 'static'`). The `dist/` folder can be deployed to any static host.

```bash
npm run build   # generates dist/
```

For Cloudflare Pages or Netlify, connect your Git repo and set the build command to `npm run build` and the output directory to `dist`.
