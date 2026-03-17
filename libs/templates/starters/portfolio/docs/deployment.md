# Deployment

This page covers how to deploy the portfolio site to production. After reading it you'll know how to set up Cloudflare Pages, configure CI/CD with GitHub Actions, and add a custom domain.

## Prerequisites

- A built site (`npm run build` produces `dist/`)
- A Cloudflare account (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (`npm i -g wrangler`)

## Cloudflare Pages (recommended)

### Manual deploy

```bash
# First time: create the Pages project
npx wrangler pages project create my-site

# Deploy
npm run deploy
```

Wrangler outputs a preview URL on each deploy. The production URL is `my-site.pages.dev`.

### Dashboard setup

Alternatively, connect your GitHub repo in the Cloudflare dashboard:

1. Go to **Workers & Pages** > **Create** > **Pages** > **Connect to Git**
2. Select your repository
3. Configure build settings:

| Setting          | Value           |
|-----------------|-----------------|
| Build command   | `npm run build` |
| Output directory | `dist`         |
| Node version    | 22              |

Cloudflare auto-deploys on every push to your production branch.

## CI/CD with GitHub Actions

For automated deploys, create `.github/workflows/deploy.yml`:

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

### Required secrets

Add these as GitHub repository secrets (**Settings > Secrets and variables > Actions**):

| Secret                   | How to get it                                                        |
|-------------------------|----------------------------------------------------------------------|
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard > My Profile > API Tokens > Create Token        |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard > any domain > Overview sidebar > Account ID    |

For the API token, use the **Cloudflare Pages: Edit** template or create a custom token with `Account.Cloudflare Pages: Edit` permission.

### PR preview deploys

Add a CI workflow for pull request checks (`.github/workflows/ci.yml`):

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run format:check
      - run: npm run build
```

If you connect your repo via the Cloudflare dashboard, preview deploys happen automatically on PRs.

## Custom domain

After your first deploy:

```bash
# Add custom domain
npx wrangler pages project add-domain my-site yourdomain.com
```

Or in the Cloudflare dashboard: **Workers & Pages > my-site > Custom domains > Set up a custom domain**.

Cloudflare handles SSL certificates automatically. If your domain's DNS is on Cloudflare, it adds the CNAME record for you. Otherwise, add a CNAME pointing to `my-site.pages.dev`.

## Other hosts

The site outputs fully static HTML. It works on any static host:

### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --dir=dist --prod
```

Or connect your repo in the Netlify dashboard with build command `npm run build` and publish directory `dist`.

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### GitHub Pages

Add to `.github/workflows/deploy.yml`:

```yaml
- uses: actions/upload-pages-artifact@v3
  with:
    path: dist
- uses: actions/deploy-pages@v4
```

Requires **Settings > Pages > Source: GitHub Actions**.

## Environment variables

No environment variables are required for static builds. The site URL is set in `astro.config.mjs` and used for sitemap generation and canonical URLs.

If you add server-side features later (API routes, SSR), configure environment variables in the Cloudflare dashboard under **Workers & Pages > my-site > Settings > Environment variables**.
