# Landing Pages

How we build, deploy, and maintain the protoLabs landing pages.

## Architecture

All landing pages are **static HTML** — no build step, no framework, no SSR. Each page is a single `index.html` file deployed to Cloudflare Pages. This is intentional: landing pages should be fast, simple, and independent of the main application.

### Tech Stack

| Layer     | Tool                 | Notes                                 |
| --------- | -------------------- | ------------------------------------- |
| Markup    | Static HTML          | Semantic, accessible, no templating   |
| Styling   | Tailwind CSS via CDN | `cdn.tailwindcss.com` — no build step |
| Fonts     | Geist + Geist Mono   | Google Fonts, preconnected            |
| Analytics | Umami                | Self-hosted at `umami.proto-labs.ai`  |
| Hosting   | Cloudflare Pages     | One project per domain                |
| DNS       | Cloudflare           | CNAME to Pages deployment             |

### Brand Tokens

All pages share the same design tokens:

```javascript
// Tailwind config (inline in each page)
colors: {
  surface: {
    0: '#09090b',  // Page background
    1: '#111113',  // Panels, containers
    2: '#18181b',  // Nested elements
    3: '#222225',  // Borders, dividers
  },
  accent: {
    DEFAULT: '#a78bfa',  // Primary violet
    dim: '#7c5cbf',      // Hover state
  },
  muted: '#71717a',  // Muted text
}
```

See `docs/protolabs/brand.md` for full brand guidelines.

## Sites

| Domain                  | Purpose                   | Directory                    | Cloudflare Project   |
| ----------------------- | ------------------------- | ---------------------------- | -------------------- |
| `protolabs.studio`      | Product landing page      | `site/index.html`            | protolabs-studio     |
| `protolabs.consulting`  | setupLab consulting       | `site/consulting/index.html` | protolabs-consulting |
| `docs.protolabs.studio` | Documentation (VitePress) | `docs/`                      | protolabs-docs       |

## Directory Structure

```
site/
├── index.html              # protolabs.studio
├── consulting/
│   └── index.html          # protolabs.consulting
└── [future-domain]/
    └── index.html
```

Each subdirectory maps to a separate Cloudflare Pages project with its own custom domain.

## Creating a New Landing Page

### 1. Create the directory

```bash
mkdir -p site/[page-name]
```

### 2. Copy the template structure

Start from an existing page (`site/index.html` or `site/consulting/index.html`). Every page needs:

- **Meta tags**: `<title>`, `<meta description>`, OG tags, Twitter card tags
- **Favicon**: Inline SVG bot icon favicon
- **Fonts**: Geist + Geist Mono via Google Fonts with `preconnect`
- **Umami**: Analytics script with unique `data-website-id` (Josh configures in Umami dashboard)
- **Tailwind CDN**: With inline config matching brand tokens
- **Skip link**: Accessibility requirement
- **Focus-visible styles**: Accessibility requirement
- **Scroll animations**: IntersectionObserver-based fade-in (copy the script block)

### 3. Brand consistency checklist

- [ ] Uses brand tokens (no hardcoded colors outside the token set)
- [ ] Geist font family (never system fonts alone)
- [ ] Violet accent (#a78bfa) for interactive elements
- [ ] Dark theme (#09090b background)
- [ ] `proto<span class="text-accent">Labs</span>` wordmark in nav
- [ ] Bot icon (Lucide `Bot`) as logo
- [ ] Footer links to Product, Docs, X/Twitter, GitHub
- [ ] No SaaS language ("subscribe", "plans", "tiers")
- [ ] Voice matches brand.md (technical, direct, pragmatic)

### 4. Accessibility requirements

- Skip-to-content link
- All interactive elements keyboard accessible
- `focus-visible` outlines on links and buttons
- Semantic HTML (`nav`, `main`, `section`, `footer`, `h1`-`h3` hierarchy)
- `aria-label` on decorative/complex elements
- Color contrast meets WCAG AA (zinc-400 on surface-0 passes)

## Deploying to Cloudflare Pages

### Option A: Direct Upload (fastest)

```bash
npx wrangler pages deploy site/consulting/ --project-name protolabs-consulting
```

### Option B: Git-connected (auto-deploy on push)

1. Create a new Pages project in Cloudflare dashboard
2. Connect the `automaker` GitHub repo
3. Configure:
   - **Framework preset**: None
   - **Build command**: _(leave empty)_
   - **Build output directory**: `site/consulting`
   - **Root directory**: `/`
4. Add custom domain in Pages settings
5. Cloudflare auto-provisions SSL

### DNS Setup

For a new domain (`protolabs.consulting`):

1. Add domain to Cloudflare (or use existing Cloudflare account)
2. Pages project > Custom domains > Add domain
3. Cloudflare adds the CNAME automatically if DNS is managed there
4. SSL provisioned automatically

### Umami Analytics

1. Create a new website in Umami dashboard (`umami.proto-labs.ai`)
2. Copy the `data-website-id`
3. Replace `REPLACE_WITH_WEBSITE_ID` in the page's `<script>` tag
4. Verify tracking in Umami dashboard after first visit

## Content Updates

Landing pages are updated manually — no CMS, no content pipeline. When stats change:

1. Update the numbers in the HTML directly
2. Commit and push (auto-deploys if git-connected, or run `wrangler pages deploy`)

**Current stats** (update periodically):

| Metric           | Value    | Source                                       |
| ---------------- | -------- | -------------------------------------------- |
| Commits          | 2,600+   | `git log --oneline \| wc -l`                 |
| PRs              | 580+     | `git log --oneline --grep="(#" \| wc -l`     |
| Lines of TS      | 370,000+ | `git ls-files '*.ts' '*.tsx' \| xargs wc -l` |
| Features shipped | 94       | Board summary                                |
| Avg cost/feature | $0.56    | Langfuse traces                              |
| Products shipped | 3        | protoLabs, MythXEngine, SVGVal               |

## Cross-linking

Landing pages should link to each other and to docs:

- `protolabs.studio` → links to Docs, consulting (if relevant)
- `protolabs.consulting` → links to Product (protolabs.studio), Docs
- `docs.protolabs.studio` → standalone VitePress site
