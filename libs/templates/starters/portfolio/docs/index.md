# Portfolio Starter Kit

Welcome to the in-app documentation for the protoLabs **portfolio starter kit** — an Astro 6 site with Content Collections, typed data, and zero external CMS dependencies.

This folder is loaded by protoLabs Studio so you can read it here without leaving your workspace.

## What's in here

| Page | What it covers |
|------|----------------|
| [Documentation philosophy](./documentation-philosophy.md) | The Diataxis framework, protoLabs writing principles, and the TTFHW metric |
| [Project structure](./project-structure.md) | Where files live, how Content Collections work, and how to add projects and blog posts |
| [Deployment](./deployment.md) | Cloudflare Pages, GitHub Actions CI/CD, custom domains, and other hosting options |

## Quick reference

```bash
# Install dependencies (must run inside this directory — not from monorepo root)
npm install

# Start the dev server
npm run dev

# Build for production (outputs to dist/)
npm run build

# Deploy to Cloudflare Pages
npm run deploy
```

The dev server starts at [localhost:4321](http://localhost:4321).

## Next steps

1. Read [Documentation philosophy](./documentation-philosophy.md) to understand how to structure your content well.
2. Read [Project structure](./project-structure.md) to understand where to put things.
3. Update `src/content/siteConfig/main.json` with your name, bio, and links.
4. Replace placeholder projects and blog posts in `src/content/` with your own.
5. Update `site` in `astro.config.mjs` with your production URL.
6. Read [Deployment](./deployment.md) to get your site live.
