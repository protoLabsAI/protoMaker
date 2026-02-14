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
- **status**: Current status ('running', 'interrupted', 'completed', 'failed')
- **currentNode**: Current graph node being executed (if interrupted)
- **progress**: Progress percentage (0-100)
- **hitlGatesPending**: Array of HITL gates waiting for review
- **error**: Error message (if failed)
- **createdAt**: Timestamp when flow was created
- **completedAt**: Timestamp when flow completed (if completed)

## Example Response

```json
{
  "runId": "content-1234567890-abc123",
  "status": "interrupted",
  "currentNode": "outline_hitl",
  "progress": 40,
  "hitlGatesPending": ["outline_hitl"],
  "createdAt": 1234567890000
}
```

## Status Values

- **running**: Flow is actively executing
- **interrupted**: Flow is paused at a HITL gate waiting for review
- **completed**: Flow finished successfully
- **failed**: Flow encountered an error

## Progress Milestones

- 0-20%: Research phase
- 20-40%: Outline generation
- 40-80%: Content generation and assembly
- 80-100%: Review and output generation
