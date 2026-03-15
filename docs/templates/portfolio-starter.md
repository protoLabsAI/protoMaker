---
outline: deep
---

# Create a portfolio site

This guide covers scaffolding and customizing the portfolio/marketing starter. By the end you have a running Astro + React site deployable to Cloudflare Pages, with agent context configured for protoLabs.

## What the starter includes

| Feature       | Detail                                                                             |
| ------------- | ---------------------------------------------------------------------------------- |
| Framework     | Astro 5 (static output, pre-generated routes)                                      |
| Interactivity | React 19 islands (`client:load`) for interactive sections only                     |
| Styling       | Tailwind CSS 4 (CSS-first config via `@theme` block in `global.css`)               |
| Content       | Astro Content Collections for blog posts, projects, testimonials, and site config  |
| SEO           | Sitemap (`@astrojs/sitemap`) and RSS feed (`@astrojs/rss`) auto-generated at build |
| CI            | GitHub Actions: build, format check, deploy to Cloudflare Pages                    |
| Agent context | `.automaker/CONTEXT.md` loaded into every agent prompt                             |

Pre-loaded board features: configure CI, set up branch protection, write README, customize site identity, add portfolio projects, write blog posts, configure custom domain, add testimonials.

## Scaffold the project

**Via CLI:**

```bash
npx create-protolab
# Select: portfolio
# Enter project name when prompted
```

**Via UI:**

Open the New Project dialog → select **Portfolio** from the template dropdown → enter a project name → click Create.

After scaffolding:

```bash
cd <your-project-name>
npm install
npm run dev
```

The dev server starts at `http://localhost:4321`.

> The portfolio starter is a standalone project. Run `npm install` inside the scaffolded directory, not from the monorepo root.

## Customize site identity

Edit `src/content/siteConfig/config.json` to update author name, tagline, social links, and default SEO metadata:

```json
{
  "name": "Your Name",
  "tagline": "Full-stack engineer building things on the web.",
  "email": "you@example.com",
  "social": {
    "github": "https://github.com/yourhandle",
    "twitter": "https://twitter.com/yourhandle",
    "linkedin": "https://linkedin.com/in/yourhandle"
  }
}
```

Update `astro.config.mjs` with your production domain:

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://yourname.dev',
  // ...
});
```

## Add portfolio projects

Create a new `.mdx` file in `src/content/projects/`:

```bash
touch src/content/projects/my-project.mdx
```

Required frontmatter fields:

```mdx
---
title: My Project
description: A short description shown on the projects grid.
date: 2026-01-15
tags: [TypeScript, React, Postgres]
image: ./images/my-project.png
githubUrl: https://github.com/you/my-project
liveUrl: https://my-project.example.com
featured: true
---

## Overview

Write the full project write-up here in MDX. Use headings, code blocks, and images freely.
```

Set `featured: true` to pin the project to the top of the projects grid.

## Write blog posts

Create a new `.mdx` file in `src/content/blog/`:

```bash
touch src/content/blog/my-post.mdx
```

Required frontmatter fields:

```mdx
---
title: My Post Title
description: A summary for the blog index and meta tags.
pubDate: 2026-03-14
tags: [Astro, TypeScript]
draft: false
---

Post content here.
```

Set `draft: true` to exclude a post from the production build while you write it.

## Customize the theme

Brand colors and design tokens are defined in `src/styles/global.css` using the Tailwind v4 `@theme` block:

```css
/* src/styles/global.css */
@import 'tailwindcss';

@theme {
  --color-surface-0: oklch(12% 0.01 270);
  --color-surface-1: oklch(16% 0.01 270);
  --color-accent: oklch(65% 0.22 270);
  --font-sans: 'Geist', system-ui, sans-serif;
}
```

All color and spacing tokens defined here become available as Tailwind utility classes (e.g., `bg-surface-0`, `text-accent`).

To add a custom font, import it before the `@theme` block:

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&display=swap');
```

## Add testimonials

Create a `.json` file in `src/content/testimonials/`:

```json
{
  "author": "Alex Chen",
  "role": "CTO at Acme Corp",
  "quote": "Shipped our entire redesign in two weeks. Remarkable.",
  "avatar": "./images/alex-chen.jpg"
}
```

Testimonials render in the home page `<Testimonials>` section automatically.

## Deploy to Cloudflare Pages

The scaffolded CI workflow (`.github/workflows/ci.yml`) handles deployment automatically on push to `main`.

To set it up manually:

1. Push the repo to GitHub.
2. In Cloudflare Pages, click **Create a project** → **Connect to Git** → select your repo.
3. Set build command: `npm run build`
4. Set output directory: `dist`

Add these secrets to your GitHub repo for the Actions deployment path:

| Secret                  | Value                                           |
| ----------------------- | ----------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Pages:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                      |

The portfolio uses Astro's `output: 'static'` mode. All routes are pre-generated at build time. New blog posts and projects require a rebuild and redeploy to appear on the live site.

## How AI agents interact with this starter

When an agent works on a feature in this project, protoLabs loads `.automaker/CONTEXT.md` into the agent's system prompt. The file explains the Content Collections schema, component structure, island hydration strategy, Tailwind v4 token conventions, and CI pipeline.

The `.automaker/coding-rules.md` file enforces Astro-specific rules: prefer zero-JS Astro components over React islands, use `client:load` only when interactivity is required on page load, never import `@automaker/types` (standalone project).

You can extend both files with project-specific rules. See [Context Files](../guides/context-files) for the full format.

## Content collection schema

| Collection     | Location                    | Format | Key fields                                         |
| -------------- | --------------------------- | ------ | -------------------------------------------------- |
| `blog`         | `src/content/blog/`         | MDX    | `title`, `description`, `pubDate`, `tags`, `draft` |
| `projects`     | `src/content/projects/`     | MDX    | `title`, `description`, `date`, `tags`, `featured` |
| `testimonials` | `src/content/testimonials/` | JSON   | `author`, `role`, `quote`, `avatar`                |
| `siteConfig`   | `src/content/siteConfig/`   | JSON   | `name`, `tagline`, `email`, `social`               |

The schema for each collection is defined in `src/content/config.ts` using Zod. Build-time validation catches missing or mistyped frontmatter fields before they reach production.

## Next steps

- [Authoring Skills](../guides/authoring-skills) — teach agents project-specific patterns
- [Context Files](../guides/context-files) — add project rules to agent prompts
- [CI/CD](../self-hosting/ci-cd) — configure advanced deployment pipelines
