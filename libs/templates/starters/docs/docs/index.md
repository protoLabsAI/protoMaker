# Docs Starter Kit

Welcome to the in-app documentation for the protoLabs **docs starter kit** — an Astro Starlight site pre-configured with the protoLabs brand theme, Diataxis content structure, and Pagefind search.

This folder is loaded by protoLabs Studio so you can read it here without leaving your workspace.

## What's in here

| Page | What it covers |
|------|----------------|
| [Documentation philosophy](./documentation-philosophy.md) | The Diataxis framework, protoLabs writing principles, and the TTFHW metric |
| [Project structure](./project-structure.md) | Where files live, how the sidebar is generated, and how to add content |

## Quick reference

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production (outputs to dist/)
npm run build
```

The dev server starts at [localhost:4321](http://localhost:4321). Pages are auto-discovered from `src/content/docs/` — no sidebar configuration needed for new files.

## Next steps

1. Read [Documentation philosophy](./documentation-philosophy.md) to understand how to structure content well.
2. Read [Project structure](./project-structure.md) to understand where to put things.
3. Replace the placeholder content in `src/content/docs/` with your own pages.
4. Update `site` in `astro.config.mjs` with your production URL.
