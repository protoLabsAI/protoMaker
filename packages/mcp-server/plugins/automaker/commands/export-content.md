---
name: export-content
description: Export generated content in a specific format
argument-hint: runId and format
---

# Export Content

Export generated content in a specific format (markdown, HuggingFace dataset, JSONL, or frontmatter markdown).

## Usage

```typescript
// Export as markdown
mcp__plugin_automaker_automaker__export_content({
  projectPath: '/path/to/project',
  runId: 'content-1234567890-abc123',
  format: 'markdown',
});

// Export as HuggingFace dataset
mcp__plugin_automaker_automaker__export_content({
  projectPath: '/path/to/project',
  runId: 'content-1234567890-abc123',
  format: 'hf-dataset',
});

// Export as JSONL
mcp__plugin_automaker_automaker__export_content({
  projectPath: '/path/to/project',
  runId: 'content-1234567890-abc123',
  format: 'jsonl',
});

// Export with frontmatter
mcp__plugin_automaker_automaker__export_content({
  projectPath: '/path/to/project',
  runId: 'content-1234567890-abc123',
  format: 'frontmatter-md',
});
```

## Parameters

- **projectPath** (required): Absolute path to the project
- **runId** (required): The flow run identifier
- **format** (required): Export format:
  - `markdown` - Plain markdown file
  - `hf-dataset` - HuggingFace dataset JSON format
  - `jsonl` - JSON Lines format (one JSON object per line)
  - `frontmatter-md` - Markdown with YAML frontmatter

## Returns

Returns an object with:

- **success**: Whether the export succeeded
- **filePath**: Path to the exported file (if successful)
- **error**: Error message (if failed)

## Example Response

```json
{
  "success": true,
  "filePath": "/path/to/project/.automaker/content/content-1234567890-abc123/content.md"
}
```

## Export Formats

### markdown

Plain markdown file, identical to the generated content:

```markdown
# Title

## Section 1

Content...
```

### frontmatter-md

Markdown with YAML frontmatter header:

```markdown
---
title: Generated Content
date: 2024-01-15T10:30:00Z
---

# Title

## Section 1

Content...
```

### jsonl

JSON Lines format (one JSON object per line):

```json
{ "content": "# Title\n\n## Section 1\nContent...", "createdAt": 1234567890000 }
```

### hf-dataset

HuggingFace dataset JSON format:

```json
{
  "text": "# Title\n\n## Section 1\nContent...",
  "metadata": {
    "runId": "content-1234567890-abc123",
    "createdAt": 1234567890000
  }
}
```

## Use Cases

- **markdown**: Direct use in documentation sites
- **frontmatter-md**: Static site generators (Gatsby, Hugo, Jekyll)
- **jsonl**: Training data pipelines, bulk processing
- **hf-dataset**: Fine-tuning LLMs with HuggingFace
