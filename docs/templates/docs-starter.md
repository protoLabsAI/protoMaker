---
outline: deep
---

# Create a documentation site

This guide covers scaffolding and customizing the VitePress documentation starter. By the end you have a running VitePress site deployable to Cloudflare Pages, with agent context configured for protoLabs.

## What the starter includes

| Feature       | Detail                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| Framework     | VitePress 1.x                                                                  |
| Search        | Built-in local search (zero config)                                            |
| Theme         | Custom CSS variable overrides with dark/light mode                             |
| Formatting    | Prettier 3                                                                     |
| Linting       | markdownlint-cli2                                                              |
| CI            | GitHub Actions: build, format check, markdown lint, deploy to Cloudflare Pages |
| Agent context | `.automaker/CONTEXT.md` loaded into every agent prompt                         |

Pre-loaded board features: configure CI, set up branch protection, write README, add a tutorial, add a how-to guide, configure custom domain, create API reference.

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

The dev server starts at `http://localhost:5173`.

## Add pages

All documentation pages live as `.md` files in the project root, organized by directory. Add a file to create a new route.

```bash
# Creates /guides/my-guide
touch guides/my-guide.md
```

Every page uses a `# Heading` as its title. For SEO control, add frontmatter:

```markdown
---
title: My Guide
description: A short description shown in meta tags and search results.
---

# My Guide

Content here.
```

After creating a page, add it to the sidebar in `.vitepress/config.mts`:

```ts
sidebar: {
  '/guides/': [
    {
      text: 'How-to Guides',
      items: [
        { text: 'Add a Page', link: '/guides/add-a-page' },
        { text: 'My Guide', link: '/guides/my-guide' },
      ],
    },
  ],
},
```

## Customize the theme

Brand colors, fonts, and dark/light mode tokens are defined in `.vitepress/theme/custom.css`. Override VitePress CSS variables:

```css
/* .vitepress/theme/custom.css */
:root {
  --vp-c-brand-1: #7c3aed;
  --vp-c-brand-2: #6d28d9;
  --vp-font-family-base: 'Geist', sans-serif;
}

.dark {
  --vp-c-bg: #09090b;
  --vp-c-brand-1: #a78bfa;
}
```

## Update site metadata

Edit `.vitepress/config.mts` to set the site title, description, and nav:

```ts
// .vitepress/config.mts
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'My Docs',
  description: 'Documentation for My Project.',
  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/your-org/your-repo' }],
  },
});
```

## Deploy to Cloudflare Pages

The scaffolded CI workflow (`.github/workflows/ci.yml`) handles deployment automatically on push to `main`.

To set it up manually:

1. Push the repo to GitHub.
2. In Cloudflare Pages, click **Create a project** → **Connect to Git** → select your repo.
3. Set build command: `npm run build`
4. Set output directory: `.vitepress/dist`
5. Add environment variables if needed.

For the GitHub Actions deployment path, add these secrets to your repo:

| Secret                  | Value                                           |
| ----------------------- | ----------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Pages:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                      |

## How AI agents interact with this starter

When an agent works on a feature in this project, protoLabs loads `.automaker/CONTEXT.md` into the agent's system prompt. The file explains the project structure, VitePress routing, sidebar configuration, theming approach, and CI pipeline.

The `.automaker/coding-rules.md` file enforces stack-specific rules: Diataxis content structure, Markdown formatting, and content guidelines.

You can extend both files with project-specific rules. See [Context Files](../guides/context-files) for the full format.

## Key constraints

| Constraint                             | Reason                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| Pages are `.md` files                  | VitePress uses Markdown; no `.mdx` support                |
| Sidebar is manually configured         | Add new pages to `.vitepress/config.mts` sidebar arrays   |
| Output directory is `.vitepress/dist/` | VitePress default; CI deploy uses this path               |
| Search is built-in                     | Local provider enabled by default, no extra config needed |

## Next steps

- [Authoring Skills](../guides/authoring-skills) — teach agents project-specific patterns
- [Context Files](../guides/context-files) — add project rules to agent prompts
- [CI/CD](../self-hosting/ci-cd) — configure advanced deployment pipelines
