# Portfolio Starter Kit

Astro 6 static site with Content Collections, Tailwind CSS v4, and zero external CMS dependencies.

## Common Commands

```bash
npm install            # Install dependencies (run inside this directory)
npm run dev            # Dev server at localhost:4321
npm run build          # Static build to dist/
npm run preview        # Preview production build locally
npm run format         # Prettier write
npm run format:check   # Prettier check
npm run deploy         # Build + deploy to Cloudflare Pages
```

## Architecture

- **Framework**: Astro 6 (static output, file-based routing)
- **Styling**: Tailwind CSS v4 (CSS-first `@theme` tokens in `src/styles/global.css`)
- **Fonts**: Geist + Geist Mono via Google Fonts CDN
- **Islands**: React used only for interactive components (contact form, project filter)
- **Content**: Astro Content Collections with Zod schema validation

## Content Collections

Defined in `src/content.config.ts` (Astro 6 location — NOT `src/content/config.ts`).

| Collection     | Format   | Location                      | Purpose                      |
|---------------|----------|-------------------------------|------------------------------|
| `siteConfig`  | JSON     | `src/content/siteConfig/`     | Site name, bio, social links |
| `projects`    | Markdown | `src/content/projects/`       | Portfolio project pages      |
| `blog`        | Markdown | `src/content/blog/`           | Blog posts                   |
| `testimonials`| JSON     | `src/content/testimonials/`   | Client/colleague quotes      |

## Key Files

- `astro.config.mjs` — Site URL, integrations, Tailwind vite plugin
- `src/layouts/BaseLayout.astro` — Root layout with nav, footer, SEO meta, scroll animations
- `src/styles/global.css` — Design tokens, prose styles, utility classes
- `src/content/siteConfig/main.json` — First file to customize

## Scroll Animations

Add `class="fade-section"` to any element for scroll-triggered fade-in. The IntersectionObserver in BaseLayout handles it automatically, including across View Transition navigations.

## Deployment

### Cloudflare Pages (recommended)

```bash
# One-time setup
npx wrangler pages project create my-site-name

# Deploy
npm run deploy
```

Or connect your GitHub repo in the Cloudflare dashboard:
- Build command: `npm run build`
- Output directory: `dist`

### Other Hosts

Works with any static host (Netlify, Vercel, GitHub Pages). Build outputs to `dist/`.
