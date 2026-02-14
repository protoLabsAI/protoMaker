---
name: review-content
description: Submit HITL review decision at content flow interrupt gates
argument-hint: runId, gate, and decision
---

# Review Content

Submit a Human-in-the-Loop (HITL) review decision to resume an interrupted content flow.

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

// Reject and stop the flow
mcp__plugin_automaker_automaker__review_content({
  projectPath: '/path/to/project',
  runId: 'content-1234567890-abc123',
  gate: 'final_review_hitl',
  decision: 'reject',
  feedback: 'Content does not meet quality standards',
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

## Returns

Returns an object with:

- **success**: Whether the review was submitted successfully
- **status**: Updated flow status object

## Example Response

```json
{
  "success": true,
  "status": {
    "runId": "content-1234567890-abc123",
    "status": "running",
    "currentNode": "generate_outline",
    "progress": 45,
    "hitlGatesPending": [],
    "createdAt": 1234567890000
  }
}
```

## HITL Gates

### 1. research_hitl (20% progress)

Review parallel research findings before outline generation. Approve to proceed or revise to regenerate research with new queries.

### 2. outline_hitl (40% progress)

Review the generated content outline. Approve to start content generation or revise to regenerate the outline.

### 3. final_review_hitl (80% progress)

Final review of assembled content before output generation. Approve to generate outputs or revise to regenerate sections.

## Decision Outcomes

- **approve**: Flow continues to the next phase
- **revise**: Current phase repeats with feedback incorporated
- **reject**: Flow stops and status changes to 'failed'
