---
name: create-content
description: Trigger content creation flow for blog posts, technical documentation, or training data
argument-hint: topic and configuration
---

# Create Content

Trigger a content creation flow to generate blog posts, technical documentation, or training data.

By default, the flow runs **autonomously** with antagonistic review gates that automatically assess quality at each phase. No human intervention required.

## Usage

```typescript
// Autonomous mode (default) - runs end-to-end
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

// HITL mode - pauses at review gates for human approval
mcp__plugin_automaker_automaker__create_content({
  projectPath: '/path/to/project',
  topic: 'Introduction to LangGraph',
  contentConfig: {
    format: 'guide',
    enableHITL: true, // Pauses at review gates
    maxRetries: 3, // Max revision attempts per phase
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
  - **enableHITL**: Enable human-in-the-loop interrupt gates (default: false)
  - **maxRetries**: Max revision attempts per antagonistic review phase (default: 2)

## Returns

Returns an object with:

- **runId**: Unique identifier for this flow execution
- **status**: Initial status object containing:
  - **status**: Current status ('running', 'reviewing_research', 'reviewing_outline', 'reviewing_content', 'interrupted', 'completed', 'failed')
  - **progress**: Progress percentage (0-100)
  - **reviewScores**: Antagonistic review scores per phase (research, outline, content)
  - **hitlGatesPending**: Array of HITL gates waiting for review (only when enableHITL=true)
  - **createdAt**: Timestamp when flow was created

## Autonomous Mode (Default)

The flow uses 3 antagonistic review gates that automatically assess quality:

1. **Research Review** (~20% progress): Scores research findings on Completeness, Source Quality, Relevance, Depth
2. **Outline Review** (~40% progress): Scores outline on Structure, Flow, Coverage, Clarity
3. **Content Review** (~80% progress): Scores final content on 8 dimensions including Headline Strength, Readability, Value Density

Each review gate produces a PASS/REVISE/FAIL verdict. Failed reviews trigger automatic revision (up to `maxRetries` attempts). The flow runs to completion without human intervention.

## HITL Mode (enableHITL=true)

When HITL is enabled, the flow pauses at each review gate. Use `review-content` to provide approval or feedback. The antagonistic review still runs, but the flow waits for human confirmation.
