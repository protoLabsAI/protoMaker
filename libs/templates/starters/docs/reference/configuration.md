# Configuration

All site configuration lives in `.vitepress/config.mts` at the project root.

## Site metadata

```ts
// .vitepress/config.mts
export default defineConfig({
  title: 'My Project',
  description: 'Documentation for My Project.',
});
```

| Option        | Type     | Description                                                   |
| ------------- | -------- | ------------------------------------------------------------- |
| `title`       | `string` | Site name shown in the header and browser tab.                |
| `description` | `string` | Default `<meta name="description">` for pages.               |

## Sidebar

The sidebar is configured in `themeConfig.sidebar`. Each key maps a URL prefix to a sidebar group.

```ts
sidebar: {
  '/guides/': [
    {
      text: 'How-to Guides',
      items: [
        { text: 'Add a Page', link: '/guides/add-a-page' },
      ],
    },
  ],
},
```

## Navigation

Top-level nav links are configured in `themeConfig.nav`:

```ts
nav: [
  { text: 'Home', link: '/' },
  { text: 'Get Started', link: '/getting-started/' },
  { text: 'Guides', link: '/guides/' },
],
```

## Search

Local search is enabled by default:

```ts
search: {
  provider: 'local',
},
```

For Algolia DocSearch, replace `'local'` with your Algolia credentials. See the [VitePress search docs](https://vitepress.dev/reference/default-theme-search).

## Social links

```ts
socialLinks: [
  { icon: 'github', link: 'https://github.com/your-org/your-repo' },
  { icon: 'twitter', link: 'https://twitter.com/your-handle' },
  { icon: 'discord', link: 'https://discord.gg/your-server' },
],
```

## Custom CSS

Theme overrides live in `.vitepress/theme/custom.css`. Override VitePress CSS variables to change colors, fonts, and spacing:

```css
:root {
  --vp-c-brand-1: #7c3aed;
  --vp-c-brand-2: #6d28d9;
}
```

The starter ships with a violet accent theme. Edit `custom.css` to match your brand.

## Edit link

```ts
editLink: {
  pattern: 'https://github.com/your-org/your-repo/edit/main/:path',
  text: 'Edit this page on GitHub',
},
```

## Deployment

### Cloudflare Pages

1. Connect your Git repo in the Cloudflare dashboard.
2. Set **Build command**: `npm run build`
3. Set **Build output directory**: `.vitepress/dist`

### GitHub Pages

Add a GitHub Actions workflow — see the [VitePress deploy guide](https://vitepress.dev/guide/deploy).

### Netlify / Vercel

Set build command to `npm run build` and output directory to `.vitepress/dist`.
