# Portfolio Starter Kit

A production-ready Astro 6 portfolio site with Content Collections, Tailwind CSS v4, and zero external CMS dependencies. Dark theme, Geist fonts, violet accent — ready to customize.

## Quick Start

```bash
npm install
npm run dev
```

Open [localhost:4321](http://localhost:4321). Edit `src/content/siteConfig/main.json` with your name, bio, and links.

## Features

- **Astro 6** — Static site generation with file-based routing
- **Tailwind CSS v4** — CSS-first configuration with `@theme` tokens
- **Content Collections** — Zod-validated markdown and JSON content
- **React Islands** — Interactive components (contact form, project filter) with minimal JS
- **SEO** — Open Graph, Twitter Cards, sitemap, canonical URLs
- **Accessibility** — Skip-to-content, focus rings, semantic HTML
- **View Transitions** — Smooth page-to-page navigation via Astro ClientRouter
- **Scroll Animations** — IntersectionObserver-powered fade-ins

## Project Structure

```
src/
  content/
    siteConfig/main.json    # Your identity — name, bio, social links
    projects/*.md            # Portfolio projects
    blog/*.md                # Blog posts
    testimonials/*.json      # Quotes from clients/colleagues
  content.config.ts          # Collection schemas (Astro 6 location)
  layouts/BaseLayout.astro   # Root layout with nav, footer, SEO
  pages/                     # File-based routes
  components/                # Reusable Astro and React components
  styles/global.css          # Design tokens and utility classes
```

## Customization

1. **Identity** — Edit `src/content/siteConfig/main.json`
2. **Site URL** — Update `site` in `astro.config.mjs`
3. **Colors** — Modify `@theme` tokens in `src/styles/global.css`
4. **Content** — Replace sample projects, blog posts, and testimonials in `src/content/`
5. **Pages** — Add or remove routes in `src/pages/`

## Deployment

### Cloudflare Pages

```bash
# One-time: create the Pages project
npx wrangler pages project create my-site

# Deploy
npm run deploy
```

Or connect your GitHub repo in the Cloudflare dashboard:

| Setting          | Value          |
|-----------------|----------------|
| Build command   | `npm run build` |
| Output directory | `dist`         |
| Node version    | 22             |

### CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=my-site
```

Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.

### Other Hosts

The site outputs fully static HTML to `dist/`. Deploy to Netlify, Vercel, GitHub Pages, or any static host:

```bash
npm run build   # generates dist/
```

## Commands

| Command              | Description                        |
|---------------------|------------------------------------|
| `npm run dev`       | Dev server at localhost:4321       |
| `npm run build`     | Static build to `dist/`           |
| `npm run preview`   | Preview production build locally   |
| `npm run format`    | Format with Prettier               |
| `npm run deploy`    | Build + deploy to Cloudflare Pages |
