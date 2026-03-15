---
outline: deep
---

# Create a landing page

This guide covers scaffolding and customizing the landing page starter. By the end you have a running Astro 5 site with composable sections, scroll animations, and CSS-variable theming — ready to deploy to Cloudflare Pages.

## What the starter includes

| Feature       | Detail                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| Framework     | Astro 5 (static output)                                                      |
| Styling       | Tailwind CSS 4 via `@tailwindcss/vite` plugin, CSS custom property tokens    |
| Sections      | Hero, Stats bar, Feature grid, Steps, Pricing, Testimonials, FAQ, CTA center |
| Animations    | Scroll-triggered fade-in via `FadeIn.astro` and IntersectionObserver         |
| Content       | Astro Content Collections for all section data (JSON files)                  |
| SEO           | Sitemap (`@astrojs/sitemap`) auto-generated at build                         |
| Agent context | `.automaker/CONTEXT.md` loaded into every agent prompt                       |

Pre-loaded board features: configure CI, set up branch protection, write README, customize brand identity, add features content, add pricing tiers, add testimonials, configure custom domain.

## Scaffold the project

**Via CLI:**

```bash
npx create-protolab
# Select: landing-page
# Enter project name when prompted
```

**Via UI:**

Open the New Project dialog → select **Landing Page** from the template dropdown → enter a project name → click Create.

After scaffolding:

```bash
cd <your-project-name>
npm install
npm run dev
```

The dev server starts at `http://localhost:4321`.

> The landing page starter is a standalone project. Run `npm install` inside the scaffolded directory, not from the monorepo root.

## Customize brand identity

Edit `src/content/siteConfig/config.json` to update the brand name, tagline, nav links, and footer:

```json
{
  "brand": {
    "name": "Acme",
    "tagline": "Build something extraordinary.",
    "description": "A modern platform that helps teams ship faster."
  },
  "nav": {
    "links": [
      { "label": "Features", "href": "#features" },
      { "label": "Pricing", "href": "#pricing" },
      { "label": "FAQ", "href": "#faq" }
    ],
    "cta": { "label": "Get Started", "href": "#get-started" }
  }
}
```

## Customize the theme

All visual tokens are CSS custom properties in `src/styles/global.css`. To rebrand, change the six surface and accent values — everything else derives from them:

```css
/* src/styles/global.css */
:root {
  /* Surface palette — 4 tiers, darkest to lightest */
  --surface-0: #09090b;
  --surface-1: #111113;
  --surface-2: #18181b;
  --surface-3: #222225;

  /* Accent — single hue, two weights */
  --accent: #a78bfa;
  --accent-dim: #7c5cbf;
}
```

The values are referenced throughout components via `var(--surface-0)`, `var(--accent)`, etc. No Tailwind config file is required.

## Edit section content

Each page section reads from a JSON file in `src/content/sections/`. Edit these files to change what appears on the page.

| Section      | File                         | Key fields                                           |
| ------------ | ---------------------------- | ---------------------------------------------------- |
| Hero         | `siteConfig/config.json`     | `brand.name`, `brand.tagline`, `brand.description`   |
| Stats bar    | `sections/stats.json`        | Array of `{ value, label }` objects                  |
| Feature grid | `sections/features.json`     | Array of `{ title, description, icon }` items        |
| Steps        | `sections/steps.json`        | Ordered array of `{ title, description }`            |
| Pricing      | `sections/pricing.json`      | Array of `{ name, price, features, featured }` tiers |
| Testimonials | `sections/testimonials.json` | Array of `{ quote, author, role, avatar }`           |
| FAQ          | `sections/faq.json`          | Array of `{ question, answer }`                      |

### Example: adding a feature

Open `src/content/sections/features.json` and append an entry:

```json
{
  "title": "Real-time collaboration",
  "description": "Work on the same document simultaneously with your team.",
  "icon": "users"
}
```

The `icon` field maps to a Lucide icon name. Any valid Lucide icon name works.

## Add or remove sections

Each section is an Astro component in `src/components/sections/`. The page assembles them in `src/pages/index.astro`:

```astro
---
import Hero from '../components/sections/Hero.astro';
import StatsBar from '../components/sections/StatsBar.astro';
import FeatureGrid from '../components/sections/FeatureGrid.astro';
// ...
---

<Hero />
<StatsBar />
<FeatureGrid />
```

To remove a section, delete its import and element. To reorder sections, move the elements. To add a custom section, create a new `.astro` file in `src/components/sections/` and import it in `index.astro`.

## Scroll animations

The `FadeIn.astro` component wraps any content with an IntersectionObserver-based fade-in effect:

```astro
---
import FadeIn from '../components/FadeIn.astro';
---

<FadeIn>
  <p>This fades in when scrolled into view.</p>
</FadeIn>
```

The animation triggers once per element when it enters the viewport. The `src/scripts/` directory contains the IntersectionObserver initialization script, loaded via `<script>` in the base layout.

## Deploy to Cloudflare Pages

Push your repo to GitHub, then in Cloudflare Pages:

1. Click **Create a project** → **Connect to Git** → select your repo.
2. Set build command: `npm run build`
3. Set output directory: `dist`

The landing page uses Astro's `output: 'static'` mode. All routes are pre-generated at build time. Content changes require a rebuild and redeploy to appear on the live site.

## Content collection schema

| Collection   | Location                  | Format | Key fields                                           |
| ------------ | ------------------------- | ------ | ---------------------------------------------------- |
| `siteConfig` | `src/content/siteConfig/` | JSON   | `brand`, `nav`, `footer`, `social`                   |
| `sections`   | `src/content/sections/`   | JSON   | `stats`, `features`, `steps`, `pricing`, `faq`, etc. |

The schema for each collection is defined in `src/content/config.ts` using Zod. Build-time validation catches missing or mistyped fields before they reach production.

## How AI agents interact with this starter

When an agent works on a feature in this project, protoLabs loads `.automaker/CONTEXT.md` into the agent's system prompt. The file explains the section component pattern, CSS custom property conventions, Content Collections schema, and how to add new sections without breaking the layout.

You can extend `.automaker/CONTEXT.md` and `.automaker/coding-rules.md` with project-specific rules. See [Context Files](../guides/context-files) for the full format.

## Next steps

- [Portfolio site starter](./portfolio-starter) — similar Astro stack with React islands and blog
- [Authoring Skills](../guides/authoring-skills) — teach agents project-specific patterns
- [Context Files](../guides/context-files) — add project rules to agent prompts
