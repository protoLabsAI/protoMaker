# Add a Page

This guide shows you how to add a new page to your documentation site.

## Create the file

Every page is a `.md` file. The directory path maps directly to the URL:

| File path                    | URL                        |
| ---------------------------- | -------------------------- |
| `guides/add-a-page.md`       | `/guides/add-a-page`       |
| `reference/configuration.md` | `/reference/configuration` |
| `index.md`                   | `/`                        |

To add a page under **How-to Guides**, create `guides/my-task.md`.

## Write the frontmatter

Frontmatter is optional in VitePress. The first `# Heading` becomes the page title. For SEO control, add frontmatter:

```markdown
---
title: My Task
description: How to do the thing in under five minutes.
---

# My Task

Your content starts here.
```

::: tip
Keep `description` under 160 characters for best SEO results.
:::

## Add to the sidebar

Edit `.vitepress/config.mts` to include your new page:

```ts
sidebar: {
  '/guides/': [
    {
      text: 'How-to Guides',
      items: [
        { text: 'Add a Page', link: '/guides/add-a-page' },
        { text: 'My Task', link: '/guides/my-task' },  // [!code ++]
      ],
    },
  ],
},
```

## Use custom containers

VitePress supports custom containers for callouts:

```markdown
::: info
This is an info box.
:::

::: tip
This is a tip.
:::

::: warning
This is a warning.
:::

::: danger
This is a danger notice.
:::
```

Renders as:

::: info
This is an info box.
:::

::: tip
This is a tip.
:::

::: warning
This is a warning.
:::

## Next steps

- **[Configuration](/reference/configuration)** — Customize the site-wide sidebar, title, and theme
- **[Quick Start](/getting-started/quick-start)** — Review the full setup tutorial
