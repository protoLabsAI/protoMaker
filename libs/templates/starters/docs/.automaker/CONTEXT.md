# Docs Starter Kit — Agent Context

This project is a **VitePress documentation site** built with VitePress 1.x.

## Project Structure

```
.vitepress/
  config.mts       ← Site config (title, sidebar, nav, theme)
  theme/
    index.ts        ← Theme entry (extends default VitePress theme)
    custom.css      ← Brand theme overrides (CSS variables)
getting-started/   ← Tutorial pages
guides/            ← How-to guides
reference/         ← Reference pages
index.md           ← Home page (hero layout)
public/            ← Static assets (images, favicons)
```

## Routing

VitePress generates routes from the file tree:

- `index.md` → `/`
- `getting-started/quick-start.md` → `/getting-started/quick-start`
- `guides/add-a-page.md` → `/guides/add-a-page`
- `reference/configuration.md` → `/reference/configuration`

## Sidebar

The sidebar is manually configured in `.vitepress/config.mts` under `themeConfig.sidebar`. Each URL prefix maps to a sidebar group. When adding a new page, add it to the corresponding sidebar array.

## Page Format

Pages are plain Markdown (`.md`). Frontmatter is optional — the first `# Heading` becomes the page title. For SEO:

```yaml
---
title: Page Title
description: Short description for meta tags
---
```

## Custom Containers

Use VitePress built-in containers for callouts:

```markdown
::: tip
This is a tip.
:::

::: warning
This is a warning.
:::

::: danger
This is a danger notice.
:::
```

## Theming

Theme customization lives in `.vitepress/theme/custom.css`. Override VitePress CSS variables (`--vp-*`) to change colors, fonts, and spacing.

## Commands

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start local dev server                       |
| `npm run build`        | Build production site to `.vitepress/dist/`  |
| `npm run preview`      | Preview the production build                 |
| `npm run format`       | Format all files with Prettier               |
| `npm run format:check` | Check formatting (used in CI)                |
| `npm run lint:md`      | Lint markdown content with markdownlint-cli2 |

## CI/CD

`.github/workflows/ci.yml` runs **build**, **format**, and **lint** jobs on every PR and push to `main`. On merge to `main`, a **deploy** job pushes to Cloudflare Pages.

## Key Constraints

- New pages go as `.md` files in the appropriate directory (getting-started, guides, reference)
- Always add new pages to the sidebar in `.vitepress/config.mts`
- Search is built-in (local provider) — no extra configuration needed
- Output directory is `.vitepress/dist/` (not `dist/`)
