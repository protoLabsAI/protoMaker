# Project structure

This page covers the file layout of the portfolio starter kit and explains how the pieces fit together. After reading it you'll know where to add projects, blog posts, and testimonials, and how the typed schema validation works.

## Directory layout

```
portfolio-starter/
├── src/
│   ├── content.config.ts       ← Zod schemas for all collections (Astro 6)
│   ├── content/
│   │   ├── blog/               ← blog posts (Markdown)
│   │   ├── projects/           ← project case studies (Markdown)
│   │   ├── siteConfig/         ← your name, bio, and nav links (JSON)
│   │   └── testimonials/       ← client/colleague quotes (JSON)
│   ├── components/             ← reusable Astro and React components
│   ├── layouts/                ← page layout wrappers
│   ├── pages/                  ← file-based routes
│   │   ├── index.astro         ← home page
│   │   ├── about.astro         ← about page
│   │   ├── blog/               ← blog listing + post pages
│   │   └── projects/           ← project listing + detail pages
│   └── styles/                 ← global CSS and Tailwind theme tokens
├── public/                     ← static assets (images, fonts, favicons)
├── astro.config.mjs            ← Astro configuration
└── package.json
```

## Content Collections

The portfolio uses Astro Content Collections for all data. Each collection has a Zod schema defined in `src/content.config.ts` (Astro 6 moved this from `src/content/config.ts`). Collections use the `glob` loader to find files. Astro validates every file in the collection at build time — missing required fields produce a type error before the build completes.

### Blog posts (`src/content/blog/`)

```markdown
---
title: "Hello World"
description: "Why I built this portfolio with Astro."
pubDate: 2025-01-10
tags: ["Astro", "Portfolio"]
author: "Your Name"
image: "/images/blog/hello-world.png"
imageAlt: "Astro logo on a dark background"
---

Your post content here.
```

Required: `title`, `description`, `pubDate`, `author`. All other fields are optional.

Add a `.md` file to `src/content/blog/` and it appears on the `/blog` listing page automatically.

### Projects (`src/content/projects/`)

```markdown
---
title: "Automaker"
description: "An AI-powered software development platform."
status: "active"
tags: ["AI", "Developer Tools"]
url: "https://protolabs.studio"
startDate: 2024-01-01
featured: true
---

Case study content here.
```

Required: `title`, `description`, `status`. Status must be one of `active`, `completed`, or `archived`.

Set `featured: true` to surface the project on the home page hero section.

### Site config (`src/content/siteConfig/main.json`)

```json
{
  "name": "Your Name",
  "title": "Software Engineer",
  "bio": "I build developer tools and design systems.",
  "email": "you@example.com",
  "social": {
    "github": "https://github.com/yourusername",
    "twitter": "https://x.com/yourusername"
  }
}
```

This is the first file to update. Your name and bio appear on the home page, about page, and page `<title>` tags.

### Testimonials (`src/content/testimonials/`)

```json
{
  "author": "Alice Chen",
  "role": "Engineering Manager",
  "company": "Acme Corp",
  "quote": "One of the sharpest engineers I've worked with.",
  "featured": true
}
```

Add one JSON file per testimonial. Set `featured: true` to include it in the home page testimonials section.

## Pages and routing

Astro uses file-based routing. The file at `src/pages/blog/index.astro` becomes the `/blog` route. Dynamic routes use bracket syntax: `src/pages/blog/[slug].astro` generates one page per blog post.

You do not need to modify the page files to add content — edit the content collections instead. Only touch `src/pages/` if you want to change the page layout or add a new route entirely.

## Styles

The portfolio uses Tailwind CSS v4 with a CSS-first `@theme` configuration block in `src/styles/global.css`. Brand tokens (surface colours, accent colours, font stack) are defined there.

Do not add raw colour utilities like `bg-gray-900` or `text-blue-600` in component files. Use the semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`) so theme changes propagate everywhere.

## Static output and deployment

The site outputs fully static HTML (`output: 'static'`). The `dist/` folder can be deployed to any static host.

```bash
npm run build    # generates dist/
npm run deploy   # build + deploy to Cloudflare Pages
```

For full deployment instructions including Cloudflare Pages setup, GitHub Actions CI/CD, custom domains, and other hosting options, see [Deployment](./deployment.md).

Because the portfolio is a standalone project (not a monorepo workspace), run `npm install` inside this directory, not from a parent repo root.
