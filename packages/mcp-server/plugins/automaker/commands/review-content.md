---
name: review-content
description: Submit HITL review decision at content flow interrupt gates (only when enableHITL=true)
argument-hint: runId, gate, and decision
---

# Review Content

Submit a Human-in-the-Loop (HITL) review decision to resume an interrupted content flow.

**Note:** This tool only works when the flow was started with `enableHITL: true`. In autonomous mode (default), the flow runs end-to-end with antagonistic review gates handling quality checks automatically.

## Usage

```typescript
// Approve research findings
mcp__plugin_automaker_automaker__review_content({
  projectPath: '/path/to/project',
  runId: 'content-1234567890-abc123',
  gate: 'research_hitl',
  decision: 'approve',
});

// Request outline revision with feedback
mcp__plugin_automaker_automaker__review_content({
  projectPath: '/path/to/project',
  runId: 'content-1234567890-abc123',
  gate: 'outline_hitl',
  decision: 'revise',
  feedback: 'Add more details about error handling and edge cases',
});
```

## Parameters

- **projectPath** (required): Absolute path to the project
- **runId** (required): The flow run identifier
- **gate** (required): Which HITL gate to respond to:
  - `research_hitl` - Review research findings
  - `outline_hitl` - Approve content outline
  - `final_review_hitl` - Final content review
- **decision** (required): Review decision:
  - `approve` - Continue to next phase
  - `revise` - Regenerate current phase with feedback
  - `reject` - Stop the flow
- **feedback** (optional): Feedback message for revision or rejection

## Prerequisites

The flow must be:

1. Started with `enableHITL: true` in the contentConfig
2. Currently in `interrupted` status at one of the HITL gates

If the flow was started in autonomous mode (default), this tool will return an error since the flow runs without interrupts.

## Decision Outcomes

- **approve**: Flow continues to the next phase
- **revise**: Current phase repeats with feedback incorporated (up to maxRetries)
- **reject**: Flow stops and status changes to 'failed'
