# Quickstart

Get your design system running in five minutes. By the end you will have a working component playground, a generated React component from a `.pen` file, and a live docs site.

## Prerequisites

- Node.js 20 or later
- Git

## Step 1: Clone and rename

```bash
git clone <repo-url> my-design-system
cd my-design-system
```

Replace `@@PROJECT_NAME` with your project name across all files:

```bash
grep -rl '@@PROJECT_NAME' . \
  --include='*.json' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.html' \
  | xargs sed -i 's/@@PROJECT_NAME/my-design-system/g'
```

## Step 2: Install dependencies

```bash
npm install
```

## Step 3: Start the dev environment

```bash
npm run dev
```

This starts two processes:

| Process        | URL                   | What it runs                    |
| -------------- | --------------------- | ------------------------------- |
| Vite app       | http://localhost:5173 | Component playground, docs site |
| Express server | http://localhost:3001 | Agent API routes                |

Open http://localhost:5173 — you should see the component playground.

## Step 4: Generate your first component

Create a `.pen` file or use the example in `packages/codegen/examples/`:

```ts
import { parsePenDocument } from 'my-design-system-pen';
import { generateFromDocument } from 'my-design-system-codegen';
import { writeFileSync } from 'fs';

const penJson = JSON.parse(readFileSync('my-button.pen', 'utf-8'));
const doc = parsePenDocument(penJson);

const files = generateFromDocument(doc);
for (const file of files) {
  writeFileSync(`src/components/${file.filename}`, file.content, 'utf-8');
}
```

Each `frame` node marked `reusable: true` in your `.pen` file becomes a `.tsx` component file.

## Step 5: Register the component

```ts
import { ComponentRegistry } from 'my-design-system-registry';

const registry = new ComponentRegistry();
registry.register({
  id: 'button',
  name: 'Button',
  category: 'atom',
  description: 'Primary action button',
  props: [
    { name: 'label', type: 'string', defaultValue: 'Click me' },
    { name: 'disabled', type: 'boolean', defaultValue: false },
  ],
});
```

The component now appears in the playground sidebar at http://localhost:5173.

## Step 6: (Optional) Enable AI agents

Export your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Then run the implement agent against your `.pen` file:

```ts
import { createImplementAgent } from 'my-design-system-agents';

const agent = createImplementAgent({ projectRoot: process.cwd() });
await agent.run({ penFilePath: 'my-button.pen', outputDir: 'src/components' });
```

The agent reads your `.pen` file, iteratively generates components, captures screenshots, and verifies its output against the design.

## Next steps

- [Design-to-code pipeline](../concepts/design-to-code.md) — understand how `.pen` files become React components
- [Adding components](../guides/adding-components.md) — add custom components to the playground
- [.pen format reference](../reference/pen-format.md) — full specification of the `.pen` file format
