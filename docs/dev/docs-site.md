# Documentation Site

protoLabs uses [VitePress](https://vitepress.dev) to generate a documentation site from the `docs/` directory.

## Quick Start

```bash
# Development server with hot reload
npm run docs:dev

# Build static site
npm run docs:build

# Preview built site
npm run docs:preview
```

The dev server runs at `http://localhost:5173` by default.

## Adding Documentation

### Add a page to an existing section

1. Create a `.md` file in the appropriate directory (e.g., `docs/agents/my-feature.md`)
2. Start the file with an H1 heading — this becomes the sidebar label
3. The page appears automatically in the sidebar (auto-generated from directory contents)

```markdown
# My New Feature

Content here. Standard markdown with all GitHub-flavored extensions.
```

### Add a new section

1. Create a new directory under `docs/` (e.g., `docs/billing/`)
2. Add markdown files to the directory
3. Update `docs/.vitepress/config.mts`:
   - Add a nav entry in `themeConfig.nav`
   - Add a sidebar entry using `generateSidebar()`

```ts
// In config.mts themeConfig.sidebar:
'/billing/': [
  {
    text: 'Billing',
    items: generateSidebar('billing', '/billing'),
  },
],
```

### Link between pages

Use relative paths from the current file:

```markdown
See the [Agent Architecture](../agents/architecture.md) for details.
```

### Add images

Place images in `docs/public/` and reference them with absolute paths:

```markdown
![Architecture Diagram](/architecture.png)
```

## How It Works

### Auto-Generated Sidebars

The `generateSidebar()` function in `config.mts` reads each directory, extracts the first H1 heading from each `.md` file as the sidebar label, and sorts alphabetically. `README.md` files become the section index page.

### Directory to URL Mapping

| File Path                     | URL                    |
| ----------------------------- | ---------------------- |
| `docs/index.md`               | `/`                    |
| `docs/agents/architecture.md` | `/agents/architecture` |
| `docs/infra/docker.md`        | `/infra/docker`        |

### Features

- **Local search** — Full-text search across all docs, zero external services
- **Dark mode** — System preference detection with manual toggle
- **Multiple sidebars** — Each section (agents, infra, dev, etc.) has its own sidebar
- **Edit on GitHub** — Every page links to its source file for quick edits
- **Auto-deploy** — Docs deploy automatically via Docker on every push to `main`

## Deploying

The build output is in `docs/.vitepress/dist/`. Deploy as a static site to any hosting.

### Staging (Docker — automatic)

The docs site deploys automatically with every push to `main` via the staging CD pipeline. It runs as a lightweight nginx container alongside the UI and server:

| Service | Port | Container          |
| ------- | ---- | ------------------ |
| UI      | 3007 | `automaker-ui`     |
| API     | 3008 | `automaker-server` |
| Docs    | 3009 | `automaker-docs`   |

The `docs` stage in the `Dockerfile` builds VitePress and serves the output via `nginx:alpine`. No manual deployment needed — it rebuilds on every deploy.

To build/test the docs container locally:

```bash
docker build --target docs -t automaker-docs .
docker run --rm -p 3009:80 automaker-docs
```

### Manual / Other Hosting

```bash
npm run docs:build

# Output in docs/.vitepress/dist/
# Deploy to GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.
```

## For SetupLab Projects

When onboarding a new project via SetupLab, add VitePress docs:

1. Install: `npm install -D vitepress`
2. Copy `docs/.vitepress/config.mts` as a template (adjust title, nav, sidebar)
3. Add scripts to `package.json`: `docs:dev`, `docs:build`, `docs:preview`
4. Add to `.gitignore`: `docs/.vitepress/dist/` and `docs/.vitepress/cache/`
5. Create `docs/index.md` with the VitePress home layout
6. Existing markdown files work as-is — no restructuring needed

See [Decision: VitePress](./docs-site-decision.md) for why VitePress was chosen.
