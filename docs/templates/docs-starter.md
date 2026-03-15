---
outline: deep
---

# Create a documentation site

This guide covers scaffolding and customizing the Starlight documentation starter. By the end you have a running Astro + Starlight site deployable to Cloudflare Pages, with agent context configured for protoLabs.

## What the starter includes

| Feature       | Detail                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| Framework     | Astro 5, Starlight 0.37 (last Astro-5-compatible release)                      |
| Styling       | Tailwind CSS 4 (CSS-first config, no `tailwind.config.js`)                     |
| Search        | Pagefind (auto-indexed at build time, zero config)                             |
| Formatting    | Prettier 3 (`.astro` files excluded — no `prettier-plugin-astro` installed)    |
| Linting       | markdownlint-cli2                                                              |
| CI            | GitHub Actions: build, format check, markdown lint, deploy to Cloudflare Pages |
| Agent context | `.automaker/CONTEXT.md` loaded into every agent prompt                         |

Pre-loaded board features: configure CI, set up branch protection, write README, add a tutorial, add a how-to guide, configure custom domain, add search, create API reference.

## Scaffold the project

**Via CLI:**

```bash
npx create-protolab
# Select: docs
# Enter project name when prompted
```

**Via UI:**

Open the New Project dialog → select **Docs** from the template dropdown → enter a project name → click Create.

After scaffolding:

```bash
cd <your-project-name>
npm install
npm run dev
```

The dev server starts at `http://localhost:4321`.

## Add pages

All documentation pages live in `src/content/docs/`. Add a `.md` or `.mdx` file to create a new route.

```bash
# Creates /guides/my-guide
touch src/content/docs/guides/my-guide.md
```

Every page requires a `title` in frontmatter:

```markdown
---
title: My Guide
description: A short description shown in meta tags and search results.
---

# My Guide

Content here.
```

Starlight auto-generates the sidebar from the directory structure. No manual sidebar config is needed unless you want custom ordering.

To control sidebar order and labels, edit `astro.config.mjs`:

```js
// astro.config.mjs
starlight({
  sidebar: [
    {
      label: 'Guides',
      items: [
        { label: 'Getting started', link: '/guides/getting-started/' },
        { label: 'My Guide', link: '/guides/my-guide/' },
      ],
    },
  ],
});
```

## Customize the theme

Brand colors, fonts, and dark/light mode tokens are defined in `src/styles/global.css`. Override Starlight's CSS variables in the `:root` and `[data-theme='dark']` selectors:

```css
/* src/styles/global.css */
:root {
  --sl-color-accent: oklch(55% 0.22 270);
  --sl-color-accent-high: oklch(75% 0.18 270);
  --sl-font: 'Geist', sans-serif;
}

[data-theme='dark'] {
  --sl-color-bg: oklch(12% 0.01 270);
  --sl-color-bg-sidebar: oklch(10% 0.01 270);
}
```

To add custom fonts, import them at the top of `global.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&display=swap');
```

## Update site metadata

Edit `astro.config.mjs` to set the site title, description, and base URL:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.example.com',
  integrations: [
    starlight({
      title: 'My Docs',
      description: 'Documentation for My Project.',
      social: {
        github: 'https://github.com/your-org/your-repo',
      },
      logo: {
        src: './src/assets/logo.svg',
      },
    }),
  ],
});
```

## Deploy to Cloudflare Pages

The scaffolded CI workflow (`.github/workflows/ci.yml`) handles deployment automatically on push to `main`.

To set it up manually:

1. Push the repo to GitHub.
2. In Cloudflare Pages, click **Create a project** → **Connect to Git** → select your repo.
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Add environment variables if needed (e.g., `SITE_URL`).

For the GitHub Actions deployment path, add these secrets to your repo:

| Secret                  | Value                                           |
| ----------------------- | ----------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Pages:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                      |

## How AI agents interact with this starter

When an agent works on a feature in this project, protoLabs loads `.automaker/CONTEXT.md` into the agent's system prompt. The file explains the project structure, routing conventions, Starlight content collection schema, theming approach, and CI pipeline.

The `.automaker/coding-rules.md` file enforces stack-specific rules: Astro-first component selection, no client-side hydration by default, Tailwind v4 CSS-first config.

You can extend both files with project-specific rules. See [Context Files](../guides/context-files) for the full format.

## Key constraints

| Constraint                            | Reason                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Starlight pinned to `^0.37.0`         | Starlight 0.38+ requires Astro 6, which is not yet supported                    |
| Zod pinned to `^3.25.0`               | Starlight 0.37 uses Zod v3 internally; Zod v4 breaks it                         |
| `.astro` files excluded from Prettier | `prettier-plugin-astro` is not installed; formatting `.astro` files would error |
| New pages in `src/content/docs/`      | Starlight only serves pages from this directory, not `src/pages/`               |

## Next steps

- [Authoring Skills](../guides/authoring-skills) — teach agents project-specific patterns
- [Context Files](../guides/context-files) — add project rules to agent prompts
- [CI/CD](../self-hosting/ci-cd) — configure advanced deployment pipelines
