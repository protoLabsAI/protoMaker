/**
 * Markdown Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Markdown } from './markdown';

const meta = {
  title: 'Molecules/Markdown',
  component: Markdown,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'Markdown content to render',
    },
    className: {
      control: 'text',
      description: 'Optional additional CSS class names',
    },
  },
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default markdown with basic content
export const Default: Story = {
  args: {
    children: `# Hello, World!

This is a **bold** statement and this is *italic* text.

Here is some \`inline code\` within a sentence.`,
  },
};

// Full featured markdown showcase
export const FullFeatured: Story = {
  args: {
    children: `# Heading 1
## Heading 2
### Heading 3
#### Heading 4

This is a paragraph with **bold**, *italic*, and \`inline code\` text.

## Lists

### Unordered
- Item one
- Item two
- Item three

### Ordered
1. First item
2. Second item
3. Third item

## Code Block

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

## Blockquote

> This is a blockquote. It can span multiple lines and contains important information.

## Horizontal Rule

---

## Links

Visit [Automaker](https://automaker.example.com) for more information.`,
  },
};

// Code-heavy content
export const CodeHeavy: Story = {
  args: {
    children: `## API Reference

Use the \`fetchData\` function to retrieve data:

\`\`\`typescript
async function fetchData(url: string): Promise<Response> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }

  return response.json();
}
\`\`\`

### Parameters

- \`url\` — The endpoint URL to fetch from
- Returns a \`Promise<Response>\` with the parsed JSON

### Example Usage

\`\`\`typescript
const data = await fetchData('/api/users');
console.log(data);
\`\`\``,
  },
};

// Simple paragraph text
export const SimpleParagraph: Story = {
  args: {
    children:
      'This is a simple paragraph of text rendered through the Markdown component. It supports **bold** and *italic* formatting without any headings.',
  },
};

// With custom className
export const WithCustomClass: Story = {
  args: {
    children: `## Customized Markdown

This story demonstrates applying a custom class name to the Markdown wrapper.

- Item A
- Item B
- Item C`,
    className: 'max-w-sm border border-border rounded-lg p-4',
  },
};
