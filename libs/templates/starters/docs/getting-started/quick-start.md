# Quick Start

This tutorial walks you through setting up your documentation site from scratch. By the end, you'll have a running site with live content and search.

## Set up your site

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd <your-repo>
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the dev server**

   ```bash
   npm run dev
   ```

   Open [localhost:5173](http://localhost:5173) in your browser. You'll see the welcome page.

4. **Create your first page**

   Add a new file at `guides/my-guide.md`:

   ```markdown
   # My First Guide

   Write your content here using **Markdown**.
   ```

   The dev server hot-reloads. Refresh to see it in the sidebar (after adding it to the sidebar config in `.vitepress/config.mts`).

5. **Build for production**

   ```bash
   npm run build
   ```

   The static site is written to `.vitepress/dist/`. Upload it to any static host (Cloudflare Pages, Netlify, Vercel, etc.).

## Project structure

After setup, your project looks like this:

```
.
├── .vitepress/
│   ├── config.mts      ← Site config (title, sidebar, nav)
│   └── theme/
│       ├── index.ts     ← Theme entry (extends default)
│       └── custom.css   ← Brand theme overrides
├── getting-started/     ← Tutorial pages
├── guides/              ← How-to guide pages
├── reference/           ← Reference pages
├── index.md             ← Home page (hero layout)
└── package.json
```

::: tip
VitePress generates routes from the file tree. `guides/add-a-page.md` becomes `/guides/add-a-page`. Add new pages to the sidebar in `.vitepress/config.mts`.
:::

## Next steps

- **[Add a Page](/guides/add-a-page)** — Learn about page frontmatter and sidebar configuration
- **[Configuration](/reference/configuration)** — Customize the site title, nav, and theme
