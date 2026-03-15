# Design-to-code pipeline

This page explains how a `.pen` design file produced by pencil.dev travels through the system and becomes production-ready React components, CSS custom properties, and W3C design tokens.

## Overview

The pipeline has four stages:

```
.pen file  →  pen/parser  →  codegen/react-generator  →  .tsx files
                  ↓
           tokens/extractor  →  CSS custom properties
                                 Tailwind config
```

Each stage is handled by an independent package with no hard coupling between them. You can use the parser alone, or plug in a custom code generator that consumes the same parsed document.

## Stage 1: Parsing the .pen file

A `.pen` file is a JSON document. The `@@PROJECT_NAME-pen` package reads it and validates its structure.

```ts
import { parsePenDocument } from '@@PROJECT_NAME-pen';

const raw = JSON.parse(fs.readFileSync('design.pen', 'utf-8'));
const doc = parsePenDocument(raw);
// doc: PenDocument with typed nodes, resolved theme, validated structure
```

`parsePenDocument` returns a `PenDocument` with:

- `doc.version` — the `.pen` format version (e.g. `"2.8"`)
- `doc.themes` — available theme dimensions (e.g. `{ Mode: ['Light', 'Dark'] }`)
- `doc.variables` — design token variable definitions
- `doc.children` — the scene graph as a typed `PenNode[]` array

All 15 node types are discriminated by their `type` field. See the [.pen format reference](../reference/pen-format.md) for the full type catalog.

## Stage 2: Scene graph traversal

The `@@PROJECT_NAME-pen` package provides a depth-first traversal utility:

```ts
import { traverse } from '@@PROJECT_NAME-pen';

traverse(doc, (node, parent, depth) => {
  if (node.type === 'frame' && node.reusable) {
    console.log(`Component boundary: ${node.name} (depth ${depth})`);
  }
  // Return false to skip this subtree
});
```

The traversal visitor receives the current node, its parent, and nesting depth. Returning `false` prunes the subtree — useful for skipping nested component definitions.

## Stage 3: Code generation

The `@@PROJECT_NAME-codegen` package takes a `PenDocument` and emits one `.tsx` file per component boundary (every `frame` with `reusable: true`).

```ts
import { generateFromDocument } from '@@PROJECT_NAME-codegen';

const files = generateFromDocument(doc);
// files: Array<{ filename: string; content: string }>
```

Internally, code generation runs five sub-passes:

| Sub-pass           | What it does                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `css-extractor`    | Walks each node and extracts CSS rules (fills, strokes, layout, typography)                       |
| `prop-extractor`   | Reads JSDoc `/** Overrides CSS var --btn-color */` comments to build a TypeScript props interface |
| `import-generator` | Collects all required imports (React, Lucide icons, CSS file)                                     |
| `jsx-serializer`   | Converts the node subtree to a JSX element tree                                                   |
| `react-generator`  | Orchestrates the four passes and assembles the final `.tsx` source string                         |

The output is valid TypeScript React code with:

- BEM CSS class names scoped to the component
- CSS custom properties (`var(--btn-color)`) for every design token
- Optional props that override the tokens at runtime
- Named Lucide icon imports for `icon_font` nodes

### Component boundaries

Only `frame` nodes with `reusable: true` become top-level components. Nested reusable frames are **not** recursively inlined — they are emitted as separate files and referenced by import name.

```json
{
  "type": "frame",
  "id": "btn-primary",
  "name": "ButtonPrimary",
  "reusable": true,
  "children": [...]
}
```

Generates `ButtonPrimary.tsx` with a `ButtonPrimary` export.

## Stage 4: Token extraction and export

The `@@PROJECT_NAME-tokens` package reads the `variables` section of the parsed document and exports tokens in your target format.

```ts
import { extractTokens, exportToCSS, exportToTailwind } from '@@PROJECT_NAME-tokens';

const tokens = extractTokens(doc);

// Write CSS custom properties
fs.writeFileSync('tokens.css', exportToCSS(tokens));

// Write Tailwind theme extension
fs.writeFileSync('tailwind.tokens.js', exportToTailwind(tokens, { version: 4 }));
```

### Token naming convention

Variable names in `.pen` follow CSS custom property conventions: `$--color-primary`, `$--spacing-4`. The extractor strips the `$` prefix and emits them as `--color-primary`, `--spacing-4` in the `:root {}` block.

Semantic token names follow the pattern `--color-{role}-{variant}`:

| Token                        | Role        | Variant                |
| ---------------------------- | ----------- | ---------------------- |
| `--color-primary`            | primary     | base                   |
| `--color-primary-foreground` | primary     | text on top of primary |
| `--color-primary-hover`      | primary     | hover state            |
| `--color-destructive`        | destructive | base                   |
| `--color-success`            | success     | base                   |

### Tailwind support

Both v3 (JS config `theme.extend`) and v4 (`@theme` CSS block) output formats are supported:

```ts
exportToTailwind(tokens, { version: 3 }); // → theme.extend object
exportToTailwind(tokens, { version: 4 }); // → @theme { ... } CSS block
```

## Color system

The `@@PROJECT_NAME-color` package generates the palette referenced by your design tokens. Colors are represented in OKLCH throughout — the perceptually uniform color space that makes WCAG contrast ratios predictable.

```ts
import { generateScale, checkContrast } from '@@PROJECT_NAME-color';

// 11-step OKLCH scale (50–950)
const violetScale = generateScale({ hue: 270, chroma: 0.18 });

// WCAG contrast check
const result = checkContrast(violetScale[900], violetScale[50]);
// result.aa → true/false (4.5:1 ratio)
// result.aaa → true/false (7:1 ratio)
```

The color package is zero-dependency and emits `oklch(...)` CSS strings directly.

## AI agent integration

The design-to-code pipeline can be driven by AI agents in the `@@PROJECT_NAME-agents` package:

1. **design-agent** — takes a designer's description and iteratively updates a `.pen` file using MCP tools
2. **implement-agent** — takes a `.pen` file, runs codegen, captures screenshots, and refines the output until it matches the design intent
3. **a11y-agent** — audits generated components against WCAG guidelines and suggests remediation

See [Running agents](../guides/running-agents.md) for setup and usage.

## MCP integration

The `@@PROJECT_NAME-mcp` package exposes the pipeline as MCP tools. When connected to Claude Code or Claude Desktop, these tools let an AI assistant call `generate_components`, `extract_tokens`, `check_contrast`, and more directly.

Wire up your tools in `packages/mcp/src/index.ts` and start the server:

```bash
node packages/mcp/dist/index.js
```

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "my-design-system": {
      "command": "node",
      "args": ["path/to/packages/mcp/dist/index.js"]
    }
  }
}
```
