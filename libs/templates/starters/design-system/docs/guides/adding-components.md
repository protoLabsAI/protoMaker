# Adding components

This guide shows you how to add a new component to the design system — from the `.pen` source design through code generation, registration, and playground documentation.

## Prerequisites

- A running dev environment (`npm run dev`)
- Basic familiarity with the [design-to-code pipeline](../concepts/design-to-code.md)

## Option A: Generate from a .pen file

Use this path when you have a component designed in pencil.dev.

### 1. Export your component

In pencil.dev, select the frame you want to export and mark it `reusable: true` in the properties panel. Export the document as `.pen` (JSON format).

### 2. Run code generation

```ts
import { parsePenDocument } from '@@PROJECT_NAME-pen';
import { generateFromDocument } from '@@PROJECT_NAME-codegen';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const raw = JSON.parse(readFileSync('designs/my-card.pen', 'utf-8'));
const doc = parsePenDocument(raw);

const files = generateFromDocument(doc);

mkdirSync('packages/app/src/components', { recursive: true });
for (const file of files) {
  writeFileSync(`packages/app/src/components/${file.filename}`, file.content);
  console.log(`Generated: ${file.filename}`);
}
```

This emits one `.tsx` file per `reusable: true` frame in your design.

### 3. Review the generated code

Open the generated file. The generator produces:

```tsx
// packages/app/src/components/Card.tsx

import React from 'react';
import './Card.css';

export interface CardProps {
  /** Overrides CSS var --card-bg */
  cardBg?: string;
  children?: React.ReactNode;
}

export function Card({ cardBg, children }: CardProps) {
  return (
    <div className="card" style={{ '--card-bg': cardBg } as React.CSSProperties}>
      {children}
    </div>
  );
}
```

And a companion CSS file with BEM classes and CSS custom properties.

Make any manual refinements needed — the generated code is a starting point, not a final artifact.

## Option B: Write from scratch

Use this path when you are building a component without a `.pen` source.

### 1. Create the component file

```tsx
// packages/app/src/components/Badge.tsx

import React from 'react';

export interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
}

export function Badge({ label, variant = 'info' }: BadgeProps) {
  return <span className={`badge badge--${variant}`}>{label}</span>;
}
```

### 2. Add CSS

```css
/* packages/app/src/components/Badge.css */

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge--success {
  background: var(--color-success-bg);
  color: var(--color-success);
}
.badge--warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}
.badge--error {
  background: var(--color-error-bg);
  color: var(--color-error);
}
.badge--info {
  background: var(--color-info-bg);
  color: var(--color-info);
}
```

Use `var(--color-*)` tokens from your token system so the component respects theme changes.

## Register the component in the playground

Once your component files exist, register them so the playground can discover and display them.

```ts
// packages/app/src/registry.ts (or wherever you initialize the registry)
import { ComponentRegistry } from '@@PROJECT_NAME-registry';

const registry = new ComponentRegistry();

registry.register({
  id: 'badge',
  name: 'Badge',
  category: 'atom', // 'atom' | 'molecule' | 'organism' | 'page'
  description: 'Status label with semantic color variants.',
  props: [
    {
      name: 'label',
      type: 'string',
      required: true,
      defaultValue: 'Status',
      description: 'Display text inside the badge.',
    },
    {
      name: 'variant',
      type: 'string',
      defaultValue: 'info',
      description: 'Color variant: success, warning, error, or info.',
    },
  ],
  tags: ['status', 'label', 'feedback'],
});
```

The `category` field controls which sidebar section the component appears in:

| Category   | Sidebar section | Typical examples            |
| ---------- | --------------- | --------------------------- |
| `atom`     | Atoms           | Button, Badge, Input, Label |
| `molecule` | Molecules       | Card, Modal, Alert          |
| `organism` | Organisms       | Navbar, Sidebar, DataTable  |
| `page`     | Pages           | DashboardPage, SettingsPage |

## Write a story

Stories live in `packages/app/src/stories/` and drive the playground's live preview and docs page.

```tsx
// packages/app/src/stories/Badge.stories.tsx

import { Badge } from '../components/Badge';

export default {
  title: 'Badge',
  component: Badge,
  category: 'atom',
  parameters: {
    docs: {
      description: 'Compact label for displaying status or metadata.',
    },
  },
  argTypes: {
    label: { control: 'text' },
    variant: {
      control: 'select',
      options: ['success', 'warning', 'error', 'info'],
    },
  },
};

export const Default = { args: { label: 'Active', variant: 'success' } };
export const Warning = { args: { label: 'Pending', variant: 'warning' } };
export const Error = { args: { label: 'Failed', variant: 'error' } };
```

Stories follow [Storybook CSF format](https://storybook.js.org/docs/react/api/csf). The playground auto-discovers all `*.stories.tsx` files under `src/stories/` via Vite's `import.meta.glob`.

## Verify in the playground

Open http://localhost:5173 and find your component in the sidebar. You should see:

- Live preview rendering with the default args
- Props editor for each registered prop
- Component description from the story `parameters.docs.description`

If the component does not appear, check:

1. The story file is in `packages/app/src/stories/` and ends with `.stories.tsx`
2. The `default` export has a `component` field
3. The Vite dev server has restarted (it hot-reloads story files automatically)

## Add content documentation (optional)

For public-facing component docs, add a markdown file to `content/components/`:

```markdown
## <!-- content/components/badge.md -->

title: Badge
category: atom

---

Use Badge to show concise status labels alongside other UI elements.

## When to use

- To indicate the status of an item (active, pending, failed)
- To show counts or metadata without breaking visual flow

## Variants

| Variant | Background | Meaning                    |
| ------- | ---------- | -------------------------- |
| success | green      | Completed or healthy state |
| warning | amber      | Needs attention            |
| error   | red        | Failure or critical state  |
| info    | blue       | Neutral information        |
```

This file is managed via TinaCMS and appears in the public docs site at `/docs/atoms/badge`.
