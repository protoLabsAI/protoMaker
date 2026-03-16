---
title: 'Hello World — Why I Built This Portfolio with Astro'
description: 'The reasoning behind choosing Astro 5 for my portfolio site, and how Content Collections make structured content a first-class citizen.'
pubDate: 2025-01-10
tags: ['Astro', 'Web Development', 'Portfolio']
author: 'Your Name'
image: '/images/blog/hello-world.png'
imageAlt: 'Astro logo on a dark background'
---

When I set out to rebuild my portfolio, I had three requirements: fast, maintainable, and easy to add structured content (projects, testimonials, blog posts) without reaching for a headless CMS.

Astro 5 with Content Collections checks all three boxes.

## Why Not Next.js or Remix?

Both are excellent frameworks, but they're optimised for dynamic, server-rendered apps. A portfolio is almost entirely static content — a perfect fit for Astro's island architecture, where only the interactive bits ship JavaScript.

The performance difference is noticeable: Astro's default output for a page with no interactive islands is pure HTML and CSS. No hydration, no runtime, no bundle to parse.

## Content Collections Are Brilliant

The killer feature for structured content is Astro's **Content Collections**. You define a Zod schema once, and Astro validates every markdown file at build time. No more silent frontmatter typos that break your layout at 2am.

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    techStack: z.array(z.string()),
    featured: z.boolean().default(false),
  }),
});
```

If a project file is missing `title`, the build fails immediately with a descriptive error. That's exactly the kind of guardrail you want on content you care about.

## View Transitions for Free

Enabling `<ViewTransitions />` in the base layout gives you smooth page-to-page transitions that feel like a single-page app — without any of the SPA plumbing. The browser's native View Transitions API does the heavy lifting; Astro just wires it up.

## Getting Started

Clone this starter, update `src/content/siteConfig/main.json` with your details, and start replacing the seed content with your own projects and posts.

```bash
npm install
npm run dev
```

That's it. Happy shipping.
