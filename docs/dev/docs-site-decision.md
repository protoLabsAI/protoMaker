# Decision: VitePress for Documentation

**Date:** 2026-02-12
**Status:** Accepted

## Context

protoLabs has 50+ markdown files across a well-organized `docs/` directory with multiple sections (agents, infra, dev, protolabs, server, integrations). These docs were only accessible via GitHub's markdown renderer or direct file reading. We need a generated documentation site with search, navigation, and dark mode.

## Options Evaluated

| Tool              | Setup     | Build Speed | Search            | Stack Fit           | Verdict      |
| ----------------- | --------- | ----------- | ----------------- | ------------------- | ------------ |
| **VitePress**     | 1-2 files | ~8s/500pg   | Built-in local    | Vite (already use)  | **Selected** |
| Starlight (Astro) | 3-4 files | ~13s/500pg  | Built-in Pagefind | New framework       | Rejected     |
| Docusaurus (Meta) | 3-5 files | 30s-8min+   | Needs Algolia     | Webpack             | Rejected     |
| Nextra            | 3-4 files | ~20s        | Built-in Pagefind | Next.js (don't use) | Rejected     |
| MkDocs Material   | 1 file    | ~10s        | Built-in          | Python (don't use)  | Rejected     |
| Fumadocs          | 5+ files  | ~20s        | Built-in          | Next.js (don't use) | Rejected     |

## Why VitePress

1. **Zero restructuring** — Existing `docs/` directory maps directly to routes. No file moves, no `src/content/docs/` requirement (Starlight), no `_meta.json` in every folder (Nextra).

2. **Stack alignment** — We already use Vite for the UI frontend. Same toolchain, same config patterns. No new framework dependency.

3. **Fastest builds** — 8s for 500 pages. Docusaurus is 4-50x slower (known performance issue in their GitHub tracker).

4. **Built-in local search** — One config line. Docusaurus requires Algolia (external service + approval process). VitePress uses MiniSearch client-side.

5. **Multiple sidebars** — Each doc section gets its own sidebar navigation. Starlight only supports a single sidebar, which breaks down with 7+ sections.

6. **Minimal new files** — Just `docs/.vitepress/config.mts` and `docs/index.md`. Docusaurus scaffolds blog/, src/pages/, static/, sidebars.js, etc.

## Why Not the Others

- **Starlight**: Must move all files to `src/content/docs/`. Single sidebar only. Adds Astro as a new framework dependency.
- **Docusaurus**: Slow builds (30s-8min+, well-documented in GitHub issues). No built-in local search. Heavy dependency tree. Infima CSS is restrictive.
- **Nextra/Fumadocs**: Both require Next.js — we use Vite+React, not Next.js. Different build system, different deployment model.
- **MkDocs Material**: Beautiful but requires Python. Cross-ecosystem dependencies (pip + npm) are a maintenance burden in a Node.js monorepo.

## Implementation

- Config: `docs/.vitepress/config.mts`
- Auto-generated sidebars from directory contents (reads H1 headings)
- npm scripts: `docs:dev`, `docs:build`, `docs:preview`
- Archived docs excluded from nav but accessible via direct URL
- Dead links allowed (cross-references to repo root files like CLAUDE.md)

## Consequences

- Vue-based under the hood (not React), but only matters for deep customization — standard markdown authoring is framework-agnostic
- New devDependency: `vitepress` (~40MB)
- Agents adding docs just write markdown — no framework knowledge needed
