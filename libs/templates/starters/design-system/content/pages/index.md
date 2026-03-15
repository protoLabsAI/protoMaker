---
title: Welcome to @@PROJECT_NAME
description: A design system for building beautiful, consistent user interfaces.
order: '1'
---

# Welcome to @@PROJECT_NAME

This design system provides reusable components, design tokens, and guidelines to help you build consistent, accessible user interfaces.

## Getting Started

Browse the component library to explore available components. Each component includes:

- **Live examples** — See the component in action in the Playground
- **Props reference** — Complete documentation of all available props
- **Design guidelines** — Learn when and how to use each component

## What's Included

- **Component Playground** — Interactive workbench for exploring and testing components
- **Design Tokens** — Colors, typography, spacing, and motion as CSS custom properties
- **Component Docs** — Usage guidelines for every component
- **Design Guidelines** — Principles for color, typography, accessibility, and more
- **Changelog** — Version history and release notes

## Project Structure

```
packages/
  app/          ← Playground + documentation site (this app)
  codegen/      ← .pen → React component generator
  color/        ← OKLCH color science engine
  tokens/       ← DTCG-spec design token system

content/
  pages/        ← Site pages (CMS-managed)
  components/   ← Component documentation (CMS-managed)
  guidelines/   ← Design guidelines (CMS-managed)
  changelog/    ← Release notes (CMS-managed)
```

## Editing Content

Content is stored as Markdown files in the `content/` directory and managed via TinaCMS.

To start editing:

1. Run `npx tinacms dev -c "vite"` from the `packages/app/` directory
2. Open [http://localhost:4001/admin](http://localhost:4001/admin)
3. Edit pages, components, and guidelines visually
4. Changes are saved directly to the git-tracked Markdown files
