# PRD: Design System Platform Starter Kit

**Author**: Ava (synthesized from deep research + due diligence agents)
**Date**: 2026-03-15
**Status**: Draft (awaiting approval)
**Version**: 1.0

## Executive Summary

This PRD defines an AI-driven design system platform starter kit that uses .pen files as the single source of truth, converts designs to React/HTML components, includes component documentation, a TinaCMS site builder, and AI agents for design, implementation, accessibility, and color theory. It distills protoLabs Studio's existing .pen ecosystem and proto2's innovations into a scaffoldable monorepo template.

**Competitive positioning**: No open-source, AI-native, end-to-end design system platform exists. Current tools are fragmented (Storybook for components, zeroheight for docs, Knapsack for design-code sync, Locofy for Figma-to-code) or closed-source/enterprise-priced.

---

## 1. Specification

### 1.1 Problem Statement

Frontend teams building design systems must glue 4-5 tools together: a component workshop (Storybook), documentation platform (zeroheight), design tool (Figma), token management (Style Dictionary), and testing infrastructure (Chromatic). AI-driven design-to-code generation exists only in closed platforms (Locofy, Anima, Builder.io). The .pen file format and existing parser/renderer infrastructure in automaker are underutilized.

Proto2 explored this space but shipped with 301 TypeScript errors, no tests, CopilotKit coupling, and OpenAI lock-in. The core innovations (XCL for 80-96% token reduction, LCH color science, component registry) are worth carrying forward with proper engineering.

### 1.2 Target Users

- **Frontend teams** building and maintaining design systems who want an integrated platform instead of gluing 5 tools together.
- **Design engineers** who want AI-assisted design-to-code conversion from .pen files.
- **protoLabs Studio users** selecting a starter kit from the new-project wizard.

### 1.3 Success Criteria

- [ ] User scaffolds a complete design system platform with `npx create-protolab my-ds --kit design-system`
- [ ] Dropping a .pen file and running the codegen pipeline produces valid React components within 5 minutes
- [ ] Generated components compile with tsc and render correctly
- [ ] Component playground starts in <2s (Ladle-level speed)
- [ ] AI agents can modify .pen files, generate code, audit a11y, and generate color palettes
- [ ] TinaCMS site builder allows non-developers to manage documentation content
- [ ] Changing design tokens in .pen file propagates to generated code via W3C DTCG pipeline
- [ ] MCP server exposes all platform capabilities for AI assistant integration

### 1.4 Non-Goals

- **Not a Figma replacement.** .pen is the native format; Figma import is v2.
- **Not multi-framework.** React first; Angular/Vue/Web Components are v2.
- **Not a SaaS platform.** Everything is self-hosted, git-backed, open-source.
- **Not Storybook.** Inspired by Ladle's speed, not Storybook's config complexity.
- **Not visual regression testing.** Chromatic-style screenshot comparison is v2.

---

## 2. Landscape Analysis

### Competing Tools

| Tool                       | Type                 | Strengths                                                                 | Weaknesses                                                           | What to Learn                                                    |
| -------------------------- | -------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Storybook 9/10**         | Component workshop   | 30M+ downloads/week, 200+ addons, CSF standard, Vitest integration        | Heavy config, slow startup on large codebases, no design integration | CSF as portable story format; addon architecture as plugin model |
| **Knapsack** ($10M raised) | Design-code platform | Single source of truth, MCP server, multi-framework, ingestion engine     | Enterprise pricing, closed-source, heavy onboarding                  | "Digital production platform" framing; MCP for AI integration    |
| **zeroheight**             | Documentation        | No-code editor, AI writing assist, Figma/Storybook sync, Content API      | Docs-only, expensive, no git-backed content, no self-hosted          | AI doc assistant pattern; Content API for extensibility          |
| **Supernova**              | AI design platform   | MCP code export, PRD generation, design token pipeline                    | Closed-source, enterprise pricing                                    | AI agent architecture for idea-to-feature pipeline               |
| **Chromatic**              | Visual testing       | Zero-flake detection, design review workflow, Storybook-native            | SaaS-only, per-snapshot pricing                                      | Visual regression approach with smart diffing                    |
| **Ladle**                  | Lightweight workshop | 10-50x faster than Storybook (~1.2s startup), Vite-native, CSF-compatible | React-only, limited ecosystem                                        | Proves minimal Vite-native workshop is viable                    |

### Key Technology Decisions

| Technology                    | Decision                        | Rationale                                                         |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| **W3C DTCG** (2025.10 stable) | Adopt as token format           | Industry standard, adopted by 10+ tools, supports P3/Oklch colors |
| **TinaCMS**                   | Git-backed CMS for site builder | Open-source, Vite+React compatible, visual editing, self-hostable |
| **axe-core**                  | A11y testing engine             | Zero false positives, ~57% WCAG coverage, AI bridges the gap      |
| **Oklch**                     | Color space for tokens          | Perceptually uniform, W3C DTCG native support                     |
| **Style Dictionary**          | Token transformation            | Amazon-backed, DTCG-compatible, CSS/Tailwind/JSON export          |
| **Stencil** (v2 only)         | Web Component compiler          | TSX input, auto-generates framework bindings                      |

---

## 3. Existing Assets (Already Built)

### In Automaker Codebase

| Component               | Location                                  | Status   | Lines                                             |
| ----------------------- | ----------------------------------------- | -------- | ------------------------------------------------- |
| PEN type system         | `libs/types/src/pen.ts`                   | Complete | 407 lines, 15 node types                          |
| PEN parser              | `libs/pen-parser/src/`                    | Working  | Parse, traverse, find reusable, resolve vars      |
| Visual renderer         | `apps/ui/src/.../designs-view/renderer/`  | Working  | Frame to div, text to span, icon to component     |
| Style utils             | `apps/ui/src/.../renderer/style-utils.ts` | Working  | PenFill/PenStroke to CSS strings                  |
| Designs API             | `apps/server/src/routes/designs/`         | Working  | CRUD for .pen files                               |
| Component library panel | `apps/ui/src/.../designs-view/library/`   | Working  | Browse reusable components, DnD                   |
| Property inspector      | `apps/ui/src/.../designs-view/inspector/` | Working  | Edit fills, strokes, layout, typography           |
| Designs store           | `apps/ui/src/store/designs-store.ts`      | Working  | Zustand with history/undo                         |
| Pencil MCP              | External MCP server                       | Working  | batch_design, get_screenshot, get_variables, etc. |
| shadcn-kit.pen          | `designs/components/shadcn-kit.pen`       | Complete | 87 reusable components                            |

### Two Competing .pen Type Systems

**`libs/pen-parser/src/types.ts`** (simplified):

- Simpler property names: `fill: string`, `layout: 'vertical'`, `gap: number`
- `$variable` syntax for theme references
- Used by parser functions

**`libs/types/src/pen.ts`** (comprehensive, 407 lines):

- Design-tool-oriented: `fills: PenFill[]`, `strokes: PenStroke[]`
- Supports gradients, images, effects (shadows, blur)
- `PenVariable` with theme-dependent values
- Used by the designs-view renderer

**Decision**: Unify on `libs/types/src/pen.ts` — it's more complete and already used by the renderer. Update pen-parser to consume those types.

### From Proto2 Repository (github.com/protoLabsAI/proto2)

| Asset                    | Location                                          | Value                                                   | Tests                    |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| **XCL converter**        | `packages/utils/src/xcl/`                         | 80-96% token reduction for LLM component operations     | Round-trip fidelity 100% |
| **XCL-to-TSX converter** | `agent/src/.../xcl-to-tsx-converter.ts`           | Direct XCL to React code without LLM                    | Working                  |
| **Color science**        | `packages/utils/src/tokens/`                      | LCH scales (11-step), harmonies, WCAG compliance        | 58/58 passing            |
| **Component registry**   | `packages/proto-config/src/component-registry.ts` | Type-safe catalog with atomic design hierarchy          | Functional               |
| **JSON Schema system**   | `public/schemas/`                                 | Schema-driven component props                           | Per-component            |
| **Component types**      | `packages/types/src/index.ts`                     | 460+ lines, ComponentSchema, PropDefinition, a11y types | Complete                 |

### Proto2 Lessons Learned (Don't Repeat)

| Issue                       | What Happened                       | Prevention                                                |
| --------------------------- | ----------------------------------- | --------------------------------------------------------- |
| 301 TypeScript errors       | Shipped broken                      | tsc --noEmit in CI from day one                           |
| No tests                    | Testing infra set up but never used | Tests required per acceptance criteria                    |
| CopilotKit coupling         | Agent logic impossible to extract   | Use Claude Agent SDK (already proven)                     |
| OpenAI-only                 | No model flexibility                | Multi-provider via AI SDK (already built in ai-agent-app) |
| TinaCMS + Redis/MongoDB     | Heavy CMS for a design tool         | TinaCMS lightweight mode (git-backed, no external DB)     |
| No multi-agent coordination | Despite being stated goal           | Agents share context via .pen files + MCP tools           |

---

## 4. Architecture

### .pen-to-Code Pipeline

```
.pen file (JSON)
  --> parsePenFile() [libs/pen-parser - EXISTS]
  --> PenDocument AST
  --> resolveVariables() + resolveRefs() [libs/pen-parser - EXISTS]
  --> Resolved AST (all tokens/refs inlined)
  --> Component boundary detection (reusable: true frames)
  --> For each component:
      --> Target-specific transformer:
          --> pen-to-react: JSX + CSS Modules / Tailwind classes
          --> pen-to-html: Semantic HTML + CSS custom properties
      --> Post-processing:
          --> Prop extraction (variables --> React props)
          --> Import generation
          --> CSS extraction (inline --> Tailwind/CSS modules)
          --> Token extraction (W3C DTCG format)
          --> Story generation (CSF auto-generated)
          --> Documentation generation (props table, usage examples)
```

### Why .pen Maps Well to React

The .pen format already mirrors CSS flexbox:

| .pen Property                      | CSS/React Equivalent                        |
| ---------------------------------- | ------------------------------------------- |
| `FrameNode` + `layout: 'vertical'` | `<div style={{ flexDirection: 'column' }}>` |
| `justifyContent` / `alignItems`    | 1:1 CSS flex properties                     |
| `gap`, `padding`                   | 1:1 CSS                                     |
| `fill`                             | `background-color` or `color`               |
| `cornerRadius`                     | `border-radius`                             |
| `reusable: true` frames            | Separate React components                   |
| `ref` nodes                        | Component instances (`<Button />`)          |
| `slot` arrays                      | React children / named slots                |
| `$--variable` references           | CSS custom properties (`var(--variable)`)   |

### Missing Pieces for Code Generation

1. **Code serializer** — Converting React element tree to JSX source code strings
2. **Component boundary detection** — Which frame subtrees become separate components vs inline elements
3. **Prop extraction** — Which variables should become React props
4. **Import generation** — Creating proper import statements
5. **CSS extraction** — Pulling inline styles into CSS modules or Tailwind classes
6. **Slot/children mapping** — The `slot` property needs formalization for React children

### Monorepo Package Structure

```
design-system-platform/
  packages/
    pen/              # .pen parser + type system (extracted from libs/pen-parser + libs/types)
    codegen/          # pen-to-React + pen-to-HTML code generators
    tokens/           # W3C DTCG token system (extract, validate, export CSS/Tailwind)
    color/            # LCH color science (ported from proto2 @proto/utils)
    a11y/             # axe-core wrapper + AI-augmented accessibility audit
    xcl/              # XCL converter (ported from proto2, 80%+ token reduction)
    registry/         # Type-safe component registry (adapted from proto2)
    agents/           # AI agents (Design, Implement, A11y, Color)
    mcp/              # MCP server exposing all platform capabilities
    app/              # Vite + React 19 SPA (playground, docs, site builder, admin)
    server/           # Express API server
  content/            # TinaCMS git-backed content (markdown, JSON)
  designs/            # .pen design files (source of truth)
  docs/               # Documentation (Diataxis framework)
```

### AI Agents

| Agent         | Model  | Tools                                                                     | Responsibility                                                                               |
| ------------- | ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Design**    | Sonnet | Pencil MCP (batch_design, set_variables, get_screenshot, snapshot_layout) | Layout decisions, spacing, typography, responsive breakpoints, create/modify .pen components |
| **Implement** | Sonnet | pen-parser, pen-to-react, file system                                     | Convert .pen designs to production React/HTML code, refine based on feedback                 |
| **A11y**      | Haiku  | axe-core, Lighthouse, DOM inspector                                       | Audit components for WCAG compliance, suggest ARIA attributes, color contrast fixes          |
| **Color**     | Haiku  | color lib, WCAG contrast checker, token manager                           | Palette generation from brand color, theme variants, contrast optimization                   |
| **QA** (v2)   | Sonnet | Playwright, visual-diff, story runner                                     | Visual regression testing, interaction testing, cross-browser checks                         |

Agents share context through:

1. The .pen file as single source of truth
2. W3C DTCG tokens as the shared design language
3. MCP tools as the unified interaction surface
4. Component stories as the test/demo contract

### MCP Server Tool Categories

| Category       | Example Tools                                                                  | Purpose                      |
| -------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| **Design**     | `get_editor_state`, `batch_design`, `get_screenshot`, `snapshot_layout`        | Read/write .pen files        |
| **Tokens**     | `get_tokens`, `set_tokens`, `export_tokens_css`, `export_tokens_json`          | W3C DTCG token CRUD + export |
| **Components** | `generate_react`, `generate_html`, `list_components`, `get_component_schema`   | Code generation              |
| **A11y**       | `audit_component`, `audit_page`, `suggest_fixes`, `check_contrast`             | Accessibility                |
| **Color**      | `generate_palette`, `check_contrast`, `suggest_alternatives`, `generate_theme` | Color theory                 |
| **Stories**    | `list_stories`, `run_story`, `generate_story`                                  | Component demos              |
| **Registry**   | `register_component`, `search_components`, `get_component_schema`              | Component catalog            |

### App Routes

```
/playground    # Component playground (Ladle-inspired, <2s startup)
/docs          # Auto-generated component documentation
/site          # TinaCMS-powered documentation site
/admin         # TinaCMS admin panel (visual editing)
/tokens        # Design token viewer + editor
/settings      # Configuration
```

---

## 5. Implementation Plan

### Milestone 1: Foundation -- .pen Parser + Code Generator (3 phases)

1. **Extract .pen parser and type system** (large) -- Create packages/pen/ with all 15 node types, parser, traversal, variable resolution, style-utils. Include shadcn-kit.pen as example.
2. **Build pen-to-React code generator** (large) -- JSX serializer, prop extraction, import generation, CSS extraction. Output .tsx files.
3. **Build pen-to-HTML code generator** (medium) -- Semantic HTML + CSS custom properties output target.

### Milestone 2: Design Tokens -- W3C DTCG + Color Science (2 phases)

1. **Build W3C DTCG token system** (large) -- Extract tokens from .pen variables, export to CSS/Tailwind/Style Dictionary, theme support.
2. **Port color science from proto2** (medium) -- LCH scales, harmonies, WCAG contrast, semantic mapping, palette generation.

### Milestone 3: Component Playground + Documentation (2 phases)

1. **Build component playground** (large) -- Vite-native, Ladle-inspired. Component list, live preview, props editor, viewport resizer, theme switcher, CSF support.
2. **Build auto-generated documentation** (medium) -- Props tables, usage examples, token references, live component embeds.

### Milestone 4: TinaCMS Site Builder (2 phases)

1. **Integrate TinaCMS** (large) -- Git-backed content, visual editing, content schema (pages, component docs, guidelines), self-hosted.
2. **Build site theme and layout** (medium) -- Sidebar with atomic design categories, search, breadcrumbs, token-driven theming.

### Milestone 5: AI Agents -- Design + Implement (2 phases)

1. **Build Design Agent** (large) -- Uses Pencil MCP tools, natural language design requests, design principles prompt.
2. **Build Implement Agent** (medium) -- Uses pen-to-react pipeline, generates single components or full libraries.

### Milestone 6: AI Agents -- A11y + Color (2 phases)

1. **Build A11y Agent** (medium) -- axe-core wrapper + AI semantic analysis, remediation suggestions with code.
2. **Build Color Agent** (medium) -- Palette from brand color, WCAG compliance, theme variants, token integration.

### Milestone 7: XCL + Component Registry (2 phases)

1. **Port XCL converter** (medium) -- Serializer, deserializer, XCL-to-TSX, round-trip validation, React 19 patterns.
2. **Build component registry** (medium) -- Type-safe catalog, JSON Schema from TypeScript, atomic design hierarchy, auto-populate.

### Milestone 8: MCP Server + Monorepo Skeleton (2 phases)

1. **Build MCP server** (large) -- All tool categories (Design, Tokens, Components, A11y, Color), uses defineSharedTool + toMCPTool.
2. **Create monorepo skeleton and scaffold function** (medium) -- Wire into scaffold system, all integration points.

### Milestone 9: Documentation + Polish + Ship (2 phases)

1. **Write documentation and README** (medium) -- Diataxis framework, quickstart, .pen format reference, MCP tools reference.
2. **End-to-end verification** (medium) -- Scaffold, build, verify pipeline, run tests.

---

## 6. Risk Assessment

| Component                | Maturity                   | Complexity | Value    | Recommendation                    |
| ------------------------ | -------------------------- | ---------- | -------- | --------------------------------- |
| .pen parser              | HIGH (exists)              | LOW        | HIGH     | Ship in v1                        |
| .pen-to-React codegen    | MEDIUM (AST maps well)     | MEDIUM     | CRITICAL | Ship in v1 -- core value prop     |
| .pen-to-HTML codegen     | MEDIUM                     | LOW        | MEDIUM   | Ship in v1                        |
| W3C DTCG tokens          | HIGH (spec stable)         | MEDIUM     | HIGH     | Ship in v1                        |
| Component playground     | HIGH (Ladle pattern)       | MEDIUM     | HIGH     | Ship in v1                        |
| TinaCMS site builder     | HIGH (mature)              | MEDIUM     | MEDIUM   | Ship in v1                        |
| Design Agent             | MEDIUM (Pencil MCP exists) | MEDIUM     | HIGH     | Ship in v1                        |
| Implement Agent          | LOW (novel)                | HIGH       | CRITICAL | Ship in v1 -- core differentiator |
| A11y Agent               | HIGH (axe-core mature)     | LOW        | HIGH     | Ship in v1                        |
| Color Agent              | MEDIUM                     | LOW        | MEDIUM   | Ship in v1                        |
| XCL converter            | HIGH (proto2 proven)       | LOW        | HIGH     | Ship in v1                        |
| Web Components (Stencil) | LOW                        | HIGH       | MEDIUM   | Defer to v2                       |
| Visual regression        | LOW                        | HIGH       | LOW (v1) | Defer to v2                       |
| QA Agent                 | MEDIUM                     | HIGH       | MEDIUM   | Defer to v2                       |
| Figma import             | LOW                        | HIGH       | MEDIUM   | Defer to v2                       |
| Multi-framework output   | LOW                        | HIGH       | LOW (v1) | Defer to v2                       |

---

## 7. v2 Roadmap (Deferred)

- Web Component generation via Stencil compiler
- Visual regression testing with Playwright screenshots + AI diff
- QA Agent for automated component testing
- Figma import (via Figma MCP server) to .pen conversion
- Multi-framework output targets (Angular, Vue, Svelte)
- Design review workflow with approval gates
- Advanced theming (multi-brand, responsive tokens)
- Component analytics (usage tracking, adoption metrics)
- Collaborative editing (CRDT-based .pen editing)
- Interactive canvas editor (built on React Flow)

---

## Appendix A: .pen File Format Reference

### Root Structure

```json
{
  "version": "2.8",
  "children": [PenNode, ...]
}
```

### Node Types (15 total)

| Type        | Interface          | Purpose                                                      |
| ----------- | ------------------ | ------------------------------------------------------------ |
| `frame`     | `PenFrame`         | Container with flexbox layout, fills, strokes, corner radius |
| `group`     | `PenGroup`         | Container without layout                                     |
| `rectangle` | `PenRectangle`     | Rectangle with per-corner radius                             |
| `ellipse`   | `PenEllipse`       | Circle/ellipse with arc support                              |
| `line`      | `PenLine`          | Line segment                                                 |
| `polygon`   | `PenPolygon`       | Multi-point polygon                                          |
| `path`      | `PenPath`          | SVG-like path data                                           |
| `text`      | `PenText`          | Text with typography props                                   |
| `icon-font` | `PenIconFont`      | Icon from icon font (e.g., Lucide)                           |
| `ref`       | `PenRef`           | Reference to another node (component instance)               |
| `image`     | `PenImage`         | Image asset reference                                        |
| `vector`    | `PenVectorGraphic` | Imported vector data                                         |
| `instance`  | `PenInstance`      | Component instance with overrides                            |

### Theme/Variable System

```json
{
  "theme": { "Mode": "Dark", "Base": "Zinc", "Accent": "Violet" },
  "variables": {
    "--background": { "type": "color", "values": { "dark": "#09090b", "light": "#ffffff" } }
  }
}
```

Variables referenced as `$--background` in node properties, resolved by `resolveVariable()`.

### Reusable Components

Frames with `"reusable": true` are component definitions. Instantiated via `ref` nodes referencing the component's ID. The `shadcn-kit.pen` file contains 87 reusable components (buttons, cards, inputs, dialogs, etc.).

---

## Appendix B: XCL Format (from Proto2)

XCL (XML Component Language) converts JSON component descriptions to XML for 80-96% LLM token reduction with 100% round-trip fidelity.

```xml
<Component name="Button" category="atoms">
  <Props>
    <Prop name="variant" type="string" default="default" options="default,destructive,outline,ghost" />
    <Prop name="size" type="string" default="default" options="default,sm,lg,icon" />
    <Prop name="children" type="ReactNode" required />
  </Props>
  <Render>
    <button className={buttonVariants({ variant, size })}>
      {children}
    </button>
  </Render>
</Component>
```

The XCL-to-TSX converter generates valid React code without LLM involvement, making it a deterministic code generation step.

---

## Appendix C: Color Science (from Proto2)

### 11-Step Color Scale

Generated from any base color using LCH color space:
`50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950`

### Color Harmonies

- Complementary (180 degrees)
- Triadic (120 degrees)
- Analogous (30 degrees)
- Split-complementary (150/210 degrees)
- Tetradic (90/180/270 degrees)

### WCAG Compliance

- Contrast ratio calculation for every color pair
- AA (4.5:1 normal text, 3:1 large text) and AAA (7:1) ratings
- Auto-suggest accessible alternatives when contrast fails

---

## Appendix D: Sources

- [Storybook 9.0 Release](https://storybook.js.org/releases/9.0)
- [Knapsack $10M Raise - TechCrunch](https://techcrunch.com/2025/10/09/knapsack-picks-up-10m-to-help-bridge-the-gap-between-design-and-engineering-teams/)
- [W3C Design Tokens Spec 2025.10](https://www.designtokens.org/tr/drafts/format/)
- [Figma MCP Server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [TinaCMS](https://tina.io/)
- [axe-core](https://github.com/dequelabs/axe-core)
- [Stencil.js](https://stenciljs.com/)
- [Ladle](https://ladle.dev/)
- [Style Dictionary](https://amzn.github.io/style-dictionary/)
- [Penpot MCP Server](https://github.com/zcube/penpot-mcp-server)
- [InclusiveColors](https://www.inclusivecolors.com/)
- [Supernova.io](https://www.supernova.io/)
- [zeroheight](https://zeroheight.com/)
