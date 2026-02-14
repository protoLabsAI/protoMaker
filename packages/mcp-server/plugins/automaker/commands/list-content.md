---
name: list-content
description: List all generated content pieces in a project
argument-hint: projectPath and optional filters
---

# List Content

List all generated content pieces from the content creation pipeline.

## Usage

```typescript
// List all content
mcp__plugin_automaker_automaker__list_content({
  projectPath: '/path/to/project',
});

// Filter by status
mcp__plugin_automaker_automaker__list_content({
  projectPath: '/path/to/project',
  filters: {
    status: 'completed',
  },
});
```

## Parameters

- **projectPath** (required): Absolute path to the project
- **filters** (optional): Filter criteria:
  - **status**: Filter by status ('completed', 'failed', etc.)

## Returns

Returns an object with:

- **content**: Array of content metadata objects, each containing:
  - **runId**: Unique identifier for the flow run
  - **topic**: Content topic
  - **format**: Content format (guide, tutorial, reference)
  - **status**: Completion status
  - **outputPath**: Path to generated content directory
  - **createdAt**: Timestamp when content was created

## Example Response

```json
{
  "content": [
    {
      "runId": "content-1234567890-abc123",
      "topic": "Introduction to LangGraph",
      "format": "guide",
      "status": "completed",
      "outputPath": "/path/to/project/.automaker/content/content-1234567890-abc123",
      "createdAt": 1234567890000
    },
    {
      "runId": "content-0987654321-xyz789",
      "topic": "Advanced State Management",
      "format": "tutorial",
      "status": "completed",
      "outputPath": "/path/to/project/.automaker/content/content-0987654321-xyz789",
      "createdAt": 1234567800000
    }
  ]
}
```

## Content Storage

Generated content is stored in `.automaker/content/{runId}/` with:

- `content.md` - Markdown output
- `content.html` - HTML output (if requested)
- `content.pdf` - PDF output (if requested)
- `metadata.json` - Content metadata
