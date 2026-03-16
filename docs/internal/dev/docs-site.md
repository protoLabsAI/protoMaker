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
See the [Agent Architecture](../../concepts/agent-architecture.md) for details.
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
- **Auto-deploy** — Docs deploy automatically via Cloudflare Pages on every push

## Deploying

The build output is in `docs/.vitepress/dist/`. Hosted on Cloudflare Pages at `docs.protolabs.studio`.

### Cloudflare Pages (automatic)

The docs site deploys via Wrangler CLI in `.github/workflows/deploy-docs.yml`. The workflow:

1. Triggers on `docs/**` changes pushed to dev, staging, or main
2. Builds VitePress on `ubuntu-latest` (no self-hosted runner needed)
3. Deploys to Cloudflare Pages project `protolabs-docs` via `wrangler pages deploy`
4. Production branch is `staging` (user-facing surface)

PR preview deployments are automatic — a comment with the preview URL is posted on every PR that touches docs.

### Required GitHub secrets

- `CLOUDFLARE_API_TOKEN` — API token with `Cloudflare Pages:Edit` permission
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID

### Custom domain setup

The custom domain `docs.protolabs.studio` is added via:

```bash
npx wrangler pages project add-domain protolabs-docs docs.protolabs.studio
```

Cloudflare manages DNS and SSL automatically.

### Local development

```bash
# Dev server with hot reload
npm run docs:dev

# Build and preview locally
npm run docs:build
npm run docs:preview
```

## For SetupLab Projects

When onboarding a new project via SetupLab, add VitePress docs:

1. Install: `npm install -D vitepress`
2. Copy `docs/.vitepress/config.mts` as a template (adjust title, nav, sidebar)
3. Add scripts to `package.json`: `docs:dev`, `docs:build`, `docs:preview`
4. Add to `.gitignore`: `docs/.vitepress/dist/` and `docs/.vitepress/cache/`
5. Create `docs/index.md` with the VitePress home layout
6. Existing markdown files work as-is — no restructuring needed
