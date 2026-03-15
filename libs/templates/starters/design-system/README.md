# @@PROJECT_NAME Design System

A full-stack design system starter kit with AI-powered code generation, OKLCH color science, and a live component playground.

## What you get

- **11 packages** covering every layer: design parsing, code generation, tokens, color science, accessibility, AI agents, and an MCP server
- **Zero-dependency core libraries** — pen, color, xcl, and registry have no external dependencies
- **Design-to-code pipeline** — parse `.pen` files from pencil.dev and generate React components automatically
- **W3C DTCG token system** — export design tokens to CSS custom properties or Tailwind config
- **OKLCH color science** — generate WCAG-compliant palettes with perceptually uniform scales
- **AI agents** — Anthropic-powered agents for design generation, accessibility auditing, and code implementation
- **Live playground** — interactive component explorer with props editor and docs site
- **CMS-managed docs** — TinaCMS for git-backed, markdown-driven content

## Architecture

```
@@PROJECT_NAME/
├── packages/
│   ├── pen/        ─── .pen file parser & traversal (zero deps)
│   ├── codegen/    ─── .pen → React component generator
│   ├── tokens/     ─── W3C DTCG token extractor & CSS/Tailwind exporter
│   ├── color/      ─── OKLCH color science: scales, harmonies, WCAG contrast
│   ├── xcl/        ─── XCL codec: ComponentDef ↔ XML ↔ TSX (zero deps)
│   ├── registry/   ─── In-memory component registry (zero deps)
│   ├── a11y/       ─── Accessibility auditing with axe-core
│   ├── agents/     ─── AI agents: design, a11y, implement
│   ├── mcp/        ─── MCP server for AI tool integration
│   ├── server/     ─── Express backend for agent routes
│   └── app/        ─── React 19 + Vite playground & docs site
└── content/        ─── CMS-managed design docs (TinaCMS / git-backed)
```

**Design-to-code pipeline:**

```
pencil.dev  →  .pen file  →  pen/parser  →  codegen/react-generator  →  .tsx files
                                                      ↓
                                            tokens/extractor  →  CSS / Tailwind
```

**AI agent flow:**

```
designer intent  →  agents/design-agent   →  MCP tools  →  updated .pen file
                 →  agents/a11y-agent    →  WCAG report
                 →  agents/implement     →  refined .tsx files
```

## Prerequisites

- Node.js 20+
- An Anthropic API key (for AI agents only — the rest works without it)

## Getting started

### 1. Clone and rename

```bash
# Clone this template
git clone <repo-url> my-design-system
cd my-design-system

# Replace @@PROJECT_NAME with your project name everywhere
grep -rl '@@PROJECT_NAME' . \
  --include='*.json' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.html' \
  | xargs sed -i 's/@@PROJECT_NAME/my-design-system/g'
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the dev environment

```bash
npm run dev
```

This starts two servers in parallel:

- `packages/server` — Express backend on port 3001
- `packages/app` — Vite dev server on port 5173

Open `http://localhost:5173` to see the playground.

### 4. (Optional) Enable AI agents

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Then start the MCP server to expose design system tools to Claude:

```bash
node packages/mcp/dist/index.js
```

## Documentation

| Guide                                                      | What it covers                            |
| ---------------------------------------------------------- | ----------------------------------------- |
| [Quickstart](docs/getting-started/quickstart.md)           | Get running in 5 minutes                  |
| [Design-to-code pipeline](docs/concepts/design-to-code.md) | How `.pen` files become React components  |
| [Adding components](docs/guides/adding-components.md)      | Register and document a new component     |
| [.pen format reference](docs/reference/pen-format.md)      | Complete `.pen` file format specification |

## Package overview

| Package                   | Purpose                                            | Dependencies                     |
| ------------------------- | -------------------------------------------------- | -------------------------------- |
| `@@PROJECT_NAME-pen`      | Parse and traverse `.pen` design files             | zero                             |
| `@@PROJECT_NAME-codegen`  | Generate React `.tsx` from `.pen` documents        | pen, lucide-react (optional)     |
| `@@PROJECT_NAME-tokens`   | Extract and export W3C DTCG design tokens          | pen                              |
| `@@PROJECT_NAME-color`    | OKLCH color scales, harmonies, WCAG contrast       | zero                             |
| `@@PROJECT_NAME-xcl`      | XCL codec: ComponentDef ↔ XML ↔ TSX                | zero                             |
| `@@PROJECT_NAME-registry` | In-memory component store                          | zero                             |
| `@@PROJECT_NAME-a11y`     | Accessibility audit (axe-core + semantic analysis) | axe-core, jsdom (peer, optional) |
| `@@PROJECT_NAME-agents`   | AI design, a11y, and implementation agents         | @anthropic-ai/sdk                |
| `@@PROJECT_NAME-mcp`      | MCP server for AI agent integration                | @modelcontextprotocol/sdk        |
| `@@PROJECT_NAME-server`   | Express backend for agent HTTP routes              | express                          |
| `app`                     | React playground, docs site, TinaCMS               | react, vite, tinacms             |

## Scripts

```bash
npm run dev          # Start server + app in parallel
npm run build        # Build all packages
npm run typecheck    # Type-check all packages
npm run test         # Run all tests
```

## Content management

Design guidelines, component docs, and changelogs live in `content/` and are managed via [TinaCMS](https://tina.io). Start the CMS-enabled dev server:

```bash
npm run dev:cms --workspace=packages/app
```

Then open `http://localhost:4001/admin` to edit content in a visual interface. All edits commit directly to git.

## License

MIT — use this as the foundation for your own design system.
