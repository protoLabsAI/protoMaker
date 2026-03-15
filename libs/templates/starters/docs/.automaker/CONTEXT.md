# Docs Starter Kit — Agent Context

This project is a **Starlight documentation site** built with Astro 5 and Starlight 0.37.

## Project Structure

```
src/
  content/
    docs/          ← All documentation pages live here
      index.mdx    ← Root page (maps to /)
      guides/      ← How-to guides
      reference/   ← Reference pages
      tutorials/   ← Step-by-step tutorials
  styles/
    global.css     ← Theme overrides (CSS variables + Tailwind v4 @theme block)
  content.config.ts ← Collection schema (docsLoader + docsSchema)
  assets/          ← Images and static files
astro.config.mjs   ← Starlight + Astro config
```

## Content Collections

All docs use Astro's **content collections** via `src/content.config.ts`. The `docs` collection uses Starlight's `docsLoader()` and `docsSchema()`:

```ts
import { defineCollection } from 'astro:content';
import { docsLoader, docsSchema } from '@astrojs/starlight/loaders';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
```

## Page Frontmatter

Every `.mdx` / `.md` file in `src/content/docs/` requires at minimum:

```yaml
---
title: Page Title
description: Short description for SEO and sidebar tooltips
---
```

Optional fields: `sidebar` (label, order, badge, hidden), `hero`, `tableOfContents`, `editUrl`, `prev`, `next`.

## Routing

Starlight auto-generates routes from the file tree:
- `src/content/docs/index.mdx` → `/`
- `src/content/docs/guides/add-a-page.mdx` → `/guides/add-a-page/`
- `src/content/docs/reference/configuration.mdx` → `/reference/configuration/`

## Theming

Theme customization lives in `src/styles/global.css`. Starlight exposes `--sl-*` CSS variables. Override them inside a `[data-theme='light']` or `[data-theme='dark']` selector, or globally:

```css
:root {
  --sl-color-accent: 124, 58, 237;  /* violet accent */
}
```

A Tailwind v4 `@theme` block can also be added for utility classes.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server |
| `npm run build` | Build production site to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting (used in CI) |
| `npm run lint:md` | Lint markdown/MDX content with markdownlint-cli2 |

## CI/CD

`.github/workflows/ci.yml` runs **build**, **format**, and **lint** jobs on every PR and push to `main`. On merge to `main`, a **deploy** job pushes to Cloudflare Pages using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## Key Constraints

- Starlight is pinned to `^0.37.0` (last Astro 5-compatible release). Do not upgrade to 0.38+ without also upgrading Astro to v6.
- Zod is pinned to `^3.25.0` because Starlight 0.37 requires Zod v3 (monorepo root has v4).
- `*.astro` files are excluded from Prettier (see `.prettierrc`) — `prettier-plugin-astro` is installed locally but not at the monorepo root.
- New pages go in `src/content/docs/`. Do not create pages in `src/pages/` — Starlight handles routing.
- Search is powered by Pagefind, auto-enabled at build time. No config required.
