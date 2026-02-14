---
name: get-content-status
description: Check the status of a content creation flow execution
argument-hint: runId
---

# Get Content Status

Check the execution status of a content creation flow.

## Usage

```typescript
mcp__plugin_automaker_automaker__get_content_status({
  runId: 'content-1234567890-abc123',
});
```

## Parameters

- **runId** (required): The unique identifier returned when the flow was created

## Returns

Returns a status object with:

- **runId**: The flow run identifier
- **status**: Current status (see Status Values below)
- **currentNode**: Current graph node being executed
- **progress**: Progress percentage (0-100)
- **reviewScores**: Antagonistic review scores per phase:
  - **research**: { percentage, passed, verdict }
  - **outline**: { percentage, passed, verdict }
  - **content**: { percentage, passed, verdict }
- **hitlGatesPending**: Array of HITL gates waiting for review (only when enableHITL=true)
- **error**: Error message (if failed)
- **createdAt**: Timestamp when flow was created
- **completedAt**: Timestamp when flow completed (if completed)

## Status Values

- **running**: Flow is actively executing
- **reviewing_research**: Antagonistic review of research findings in progress
- **reviewing_outline**: Antagonistic review of content outline in progress
- **reviewing_content**: Antagonistic review of assembled content in progress
- **interrupted**: Flow is paused at a HITL gate waiting for human review (only when enableHITL=true)
- **completed**: Flow finished successfully with all reviews passed
- **failed**: Flow encountered an error or exceeded max retries

## Progress Milestones

- 0-20%: Research phase (parallel query execution)
- 20-40%: Outline generation and review
- 40-80%: Content generation, assembly, and review
- 80-100%: Output generation (markdown, html, pdf)

## Review Verdicts

Each antagonistic review phase produces a verdict:

- **PASS**: Quality threshold met (>= 75%), flow continues
- **REVISE**: Below threshold but above 50%, automatic retry with feedback
- **FAIL**: Below 50% or max retries exceeded
