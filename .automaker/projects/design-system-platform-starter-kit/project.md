# Design System Platform Starter Kit

Build an AI-driven design system platform starter kit that uses .pen files as the single source of truth, converts designs to React/HTML components, includes component documentation, a TinaCMS site builder, and AI agents for design, implementation, accessibility, and color theory — all scaffoldable via create-protolab.

**Status:** active
**Created:** 2026-03-15T08:33:36.469Z
**Updated:** 2026-03-15T15:47:35.921Z

## PRD

### Situation

protoLabs Studio has a mature .pen design file ecosystem: a parser (libs/pen-parser), a full React renderer (designs-view), a property inspector, component library panel, and Pencil MCP integration. Proto2 explored AI-driven design system tooling with XCL (80-96% token reduction), LCH color science (58/58 tests), and component registries. The scaffold system supports docs, portfolio, landing-page, extension, general, and ai-agent-app starter kits but has no design system kit. No open-source AI-native end-to-end design system platform exists in the market.

### Problem

Frontend teams building design systems have no integrated open-source platform. Current tools are fragmented: Storybook for components (no design integration), zeroheight for docs (SaaS only), Knapsack for design-code sync (enterprise $$$), Locofy for Figma-to-code (Figma-locked). Teams must glue 4-5 tools together. AI-driven design-to-code generation exists only in closed platforms. The .pen file format and existing parser/renderer infrastructure are underutilized.

### Approach

Extract and extend the .pen ecosystem into a monorepo starter kit. Build a pen-to-code generator layered on the existing parser and style-utils. Port XCL converter and color science from proto2. Add W3C DTCG design token management. Build a Ladle-inspired component playground. Integrate TinaCMS for git-backed site building. Create AI agents (Design, Implement, A11y, Color) using Claude Agent SDK with MCP tools. Ship as libs/templates/starters/design-system/.

### Results

Users scaffold a complete design system platform. They drop .pen files in, AI agents generate React components with proper tokens and documentation. Component playground shows live previews. TinaCMS site builder lets non-developers manage the documentation site. A11y agent audits components automatically. Color agent generates WCAG-compliant palettes. Everything is git-backed, self-hosted, and extensible via MCP plugins.

### Constraints

React 19 best practices only. Claude Agent SDK as primary AI driver. npm workspaces. Must integrate with existing scaffold system. All extracted code fully decoupled from @protolabsai packages. W3C DTCG token format for interop. Ladle-level startup speed for playground (not Storybook-heavy). TinaCMS lightweight mode (git-backed, no Redis/MongoDB). Port proto2 assets with tests from day one.

## Milestones

### 1. Foundation — .pen Parser + Code Generator

Extract and extend the .pen parser into the starter kit. Build the core pen-to-React and pen-to-HTML code generation pipeline. This is the foundation everything else builds on.

**Status:** pending

#### Phases

1. **Extract .pen parser and type system** (large)
2. **Build pen-to-React code generator** (large)
3. **Build pen-to-HTML code generator** (medium)

### 2. Design Tokens — W3C DTCG + Color Science

Build the design token system using W3C DTCG standard format. Port the color science engine from proto2 for palette generation with WCAG compliance.

**Status:** completed

#### Phases

1. **Build W3C DTCG token system** (large)
2. **Port color science engine from proto2** (medium)

### 3. Component Playground + Documentation

Build a Ladle-inspired component playground for live preview and auto-generated documentation from .pen files and component source.

**Status:** pending

#### Phases

1. **Build component playground** (large)
2. **Build auto-generated documentation** (medium)

### 4. TinaCMS Site Builder

Integrate TinaCMS for git-backed content management and visual editing of the documentation site.

**Status:** pending

#### Phases

1. **Integrate TinaCMS with Vite+React** (large)
2. **Build site theme and layout system** (medium)

### 5. AI Agents — Design + Implement

Build the core AI agents for design decisions and code generation from .pen files.

**Status:** pending

#### Phases

1. **Build Design Agent** (large)
2. **Build Implement Agent** (medium)

### 6. AI Agents — A11y + Color

Build accessibility auditing and color theory agents.

**Status:** completed

#### Phases

1. **Build A11y Agent** (medium)
2. **Build Color Agent** (medium)

### 7. XCL + Component Registry

Port the XCL converter and component registry pattern from proto2 for efficient AI-driven component work.

**Status:** completed

#### Phases

1. **Port XCL converter from proto2** (medium)
2. **Build component registry** (medium)

### 8. MCP Server + Monorepo Skeleton

Build the MCP server exposing all platform capabilities and wire the monorepo scaffold.

**Status:** completed

#### Phases

1. **Build MCP server for design system** (large)
2. **Create monorepo skeleton and scaffold function** (medium)

### 9. Documentation + Polish + Ship

Write comprehensive docs, create starter features for the board, and verify end-to-end.

**Status:** pending

#### Phases

1. **Write documentation and README** (medium)
2. **End-to-end verification and build test** (medium)
