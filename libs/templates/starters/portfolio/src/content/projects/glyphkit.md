---
title: 'Glyphkit'
description: 'A design-to-code icon system with 1,200+ SVG icons, a Figma plugin, and a React component library.'
techStack: ['React', 'TypeScript', 'Figma Plugin API', 'SVG', 'Vite']
pubDate: 2024-03-15
repoUrl: 'https://github.com/yourname/glyphkit'
liveUrl: 'https://glyphkit.design'
image: '/images/projects/glyphkit.png'
imageAlt: 'Glyphkit icon browser showing a grid of vector icons'
featured: true
tags: ['Design Systems', 'Open Source', 'Developer Tools']
---

## Overview

Glyphkit is a production-ready SVG icon system built for design-code parity. Every icon ships as an optimised SVG and as a typed React component, so teams can move fluidly between Figma and their codebase without manual exports.

## Technical Approach

The build pipeline takes raw `.svg` source files, runs them through SVGO for optimisation, then code-generates both the React component bundle and the Figma plugin manifest. This guarantees the library and plugin always stay in sync.

### Highlights

- **1,200+ icons** across 40 categories, all hand-crafted on a 24px grid
- **Figma plugin** lets designers drag icons into frames with one click
- **Zero runtime dependencies** — components are purely declarative SVG wrappers
- **Tree-shakeable** — only the icons you use end up in the production bundle

## Outcome

Adopted by three product teams within the first month of release. The design system reduced icon-related Figma-to-code friction by over 80% according to team surveys.
