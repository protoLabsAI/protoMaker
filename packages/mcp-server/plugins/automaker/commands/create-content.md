---
name: create-content
description: Trigger content creation flow for blog posts, technical documentation, or training data
argument-hint: topic and configuration
---

# Create Content

Trigger a content creation flow to generate blog posts, technical documentation, or training data.

## Usage

```typescript
mcp__plugin_automaker_automaker__create_content({
  projectPath: '/path/to/project',
  topic: 'Introduction to LangGraph',
  contentConfig: {
    format: 'guide', // tutorial | reference | guide
    tone: 'conversational', // technical | conversational | formal
    audience: 'intermediate', // beginner | intermediate | expert
    outputFormats: ['markdown', 'html'], // markdown | html | pdf
  },
});
```

## Parameters

- **projectPath** (required): Absolute path to the project
- **topic** (required): Topic or subject for the content
- **contentConfig** (optional): Configuration object:
  - **format**: Content format (tutorial, reference, guide) - default: 'guide'
  - **tone**: Writing tone (technical, conversational, formal) - default: 'conversational'
  - **audience**: Target audience level (beginner, intermediate, expert) - default: 'intermediate'
  - **outputFormats**: Array of output formats (markdown, html, pdf) - default: ['markdown']

## Returns

Returns an object with:

- **runId**: Unique identifier for this flow execution
- **status**: Initial status object containing:
  - **status**: Current status ('running', 'interrupted', 'completed', 'failed')
  - **progress**: Progress percentage (0-100)
  - **hitlGatesPending**: Array of HITL gates waiting for review
  - **createdAt**: Timestamp when flow was created

## Example Response

```json
{
  "runId": "content-1234567890-abc123",
  "status": {
    "runId": "content-1234567890-abc123",
    "status": "running",
    "progress": 0,
    "hitlGatesPending": [],
    "createdAt": 1234567890000
  }
}
```

## HITL Interrupts

The content creation flow has 3 HITL (Human-in-the-Loop) interrupts:

1. **research_hitl**: Review research findings before proceeding
2. **outline_hitl**: Approve content outline before generation
3. **final_review_hitl**: Final review before output generation

When the flow reaches an interrupt, you'll need to use `review-content` to provide approval or feedback.
