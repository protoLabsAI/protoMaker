---
outline: deep
---

# Starter Kits

Starter kits are pre-configured project templates that protoLabs Studio uses to bootstrap new projects. Each kit ships with a ready-to-run project scaffold, a `.automaker/` agent configuration directory, and a board pre-loaded with initial features.

This page covers what starter kits are, how to use them, and what each one includes.

## Available kits

| Kit                                               | Source   | Stack                              | Use case                                           |
| ------------------------------------------------- | -------- | ---------------------------------- | -------------------------------------------------- |
| [Documentation site](./docs-starter)              | scaffold | Astro + Starlight + Tailwind CSS 4 | Docs sites, API references, knowledge bases        |
| [Portfolio / marketing site](./portfolio-starter) | scaffold | Astro + React 19 + Tailwind CSS 4  | Personal sites, marketing pages, project showcases |
| [Browser extension](#browser-extension)           | clone    | WXT + React 19 + TypeScript        | Chrome + Firefox extensions (Manifest V3)          |
| [General project](#general-project)               | scaffold | Blank `.automaker/` structure      | Bring-your-own codebase                            |

## Scaffold a starter

**Via the CLI:**

```bash
npx create-protolab
```

Select a kit type when prompted. The CLI copies the starter into the current directory, substitutes your project name into `package.json` and `astro.config.mjs`, and creates the initial board features.

**Via the UI:**

Open the **New Project** dialog in protoLabs Studio. Select a template from the dropdown. The UI calls the same scaffold endpoint as the CLI and opens the new project automatically.

## What the scaffold produces

Every scaffold creates:

- A ready-to-run project directory with all source files and config
- `.automaker/CONTEXT.md` — loaded into every agent prompt for this project
- `.automaker/coding-rules.md` — stack-specific conventions
- `.github/workflows/ci.yml` — CI pipeline (build, format, lint, deploy)
- Initial board features (configure CI, write README, add first content, etc.)

Run `npm install` inside the scaffolded directory before starting the dev server.

## Kit details

### Documentation site

**Source:** scaffold (local copy)
**Kit type:** `docs`
**Stack:** Astro 5, Starlight, Tailwind CSS 4, MDX, Pagefind, Cloudflare Pages

Creates a Starlight documentation site with Diataxis sidebar structure and Pagefind full-text search. The `.automaker/` config includes context tuned for docs writing: writing style conventions, page structure patterns, and frontmatter rules.

See [Documentation site starter](./docs-starter) for a full walkthrough.

### Portfolio / marketing site

**Source:** scaffold (local copy)
**Kit type:** `portfolio`
**Stack:** Astro 5, React 19, Tailwind CSS 4, Content Collections, View Transitions

Creates a portfolio site with React islands for interactive sections (project grid, contact form), Content Collections for blog posts and project data, and an RSS feed. Includes SEO meta tags, Open Graph, and Twitter Cards.

See [Portfolio site starter](./portfolio-starter) for a full walkthrough.

### Browser extension

**Source:** clone (GitHub repository)
**Kit type:** `extension`
**Stack:** WXT, React 19, TypeScript, Tailwind CSS 4, Vitest, Playwright, web-ext

Cloned from `https://github.com/protoLabsAI/browser-extension-template`. Because browser extension tooling requires native build scripts, this kit is provisioned via `git clone` rather than local file copy. The repository includes a background service worker, content script scaffold, popup and options pages, and CI pipelines for both the Chrome Web Store and Firefox AMO.

### General project

**Source:** scaffold (local copy)
**Kit type:** `general`
**Stack:** none (blank)

Creates only the `.automaker/` directory structure: `settings.json`, `categories.json`, and a placeholder `app_spec.txt`. Use this when you want to add protoLabs Studio to an existing project or a project with a stack not covered by the other kits.

The agent analyzes your codebase on the first run and populates `app_spec.txt` with what it finds.

## Scaffold vs clone

|                           | Scaffold                                           | Clone                        |
| ------------------------- | -------------------------------------------------- | ---------------------------- |
| How it works              | Files copied from `@protolabsai/templates` package | `git clone` from GitHub      |
| Offline support           | Yes                                                | No — requires network access |
| Project name substitution | Automatic (`package.json`, `astro.config.mjs`)     | Manual after clone           |
| Used by                   | docs, portfolio, general                           | browser-extension            |

## Next steps

- [Documentation site starter](./docs-starter)
- [Portfolio site starter](./portfolio-starter)
- [Architecture: how the template system works](./architecture)
- [Add a new starter kit](./add-a-starter)
