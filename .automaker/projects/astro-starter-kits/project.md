# Astro Starter Kits

Build two production-quality Astro starter kits (docs + portfolio/marketing) with cohesive protoLabs brand identity, designed for AI agent customization via Content Collections and JSON config. These become the onboarding experience for create-protolab.

**Status:** completed
**Created:** 2026-03-14T23:26:49.046Z
**Updated:** 2026-03-15T01:10:37.087Z

## PRD

### Situation

protoLabs Studio has a template system (libs/templates/) that provides metadata — starter features, coding rules, CLAUDE.md fragments, CI workflows — for three kit types: docs, extension, general. However, no actual project scaffolds exist. Users selecting 'docs' or a future 'portfolio' type get board features but no working Astro codebase. The landing page (site/) establishes a strong visual identity (Geist fonts, violet accent palette, dark surfaces, subtle glows) but this isn't packaged as a reusable design system.

### Problem

New users have no immediate 'wow moment'. There's no deployable project they can see live in 5 minutes. The onboarding flow generates board features but no code. Competitors (v0, Bolt, Lovable) deliver visual results instantly. protoLabs needs starter kits that give users a working site immediately, are structured for AI agent modification, and represent the protoLabs brand cohesively.

### Approach

Build two Astro starter kits sharing a common design system derived from the protoLabs landing page. Both use Astro SSG + React Islands architecture with Tailwind CSS 4, shadcn/ui for interactive components, and Content Collections for AI-writeable content. Kit 1 (docs): Astro Starlight with custom protoLabs theme. Kit 2 (portfolio): Custom Astro site with Hero, Projects, Blog, About, Contact sections. Both deploy to Cloudflare Pages. Wire into libs/templates/ as scaffold-able project types for create-protolab.

### Results

Two deployable starter kits with: Lighthouse scores 95+ across all metrics, Content Collections with Zod schemas for type-safe AI content generation, protoLabs brand identity (Geist fonts, violet palette, dark-first, gradient text), Pre-configured .automaker/context/ files teaching agents the codebase, CI workflows for GitHub Actions, One-command deploy to Cloudflare Pages, Integration with libs/templates/ StarterKitType system.

### Constraints

Astro 5.x stable. Tailwind CSS 4 via @tailwindcss/vite plugin. shadcn/ui for interactive React islands only. Content Collections with Zod schemas. Zero JS by default. View Transitions for SPA-like nav. Brand tokens from site/index.html. Dark-first design. No emojis.

## Milestones

### 1. Shared Design System

Extract protoLabs brand tokens into a shared Tailwind config and component library that both starter kits consume.

**Status:** completed

#### Phases

1. **Create shared Tailwind brand preset** (small)
2. **Create shared Astro component library** (medium)

### 2. Docs Starter Kit (Starlight)

Complete Astro Starlight documentation site with protoLabs custom theme.

**Status:** completed

#### Phases

1. **Scaffold Starlight project with protoLabs theme** (medium)
2. **Add docs kit CI and agent context** (small)

### 3. Portfolio Starter Kit

Custom Astro SSG + React Islands portfolio/marketing site. The flagship onboarding experience.

**Status:** completed

#### Phases

1. **Scaffold portfolio project structure** (medium)
2. **Build portfolio page sections** (large)
3. **Build portfolio sub-pages and SEO** (medium)
4. **Add portfolio kit CI and agent context** (medium)

### 4. Integration and Polish

Wire into create-protolab, verify end-to-end, and polish visuals.

**Status:** completed

#### Phases

1. **Wire starter kits into create-protolab scaffold flow** (medium)
2. **Visual polish and responsive QA** (medium)
