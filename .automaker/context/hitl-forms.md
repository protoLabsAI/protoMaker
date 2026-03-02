# HITL Form System — Quick Reference

Use `request_user_input` to collect structured information from the user via JSON Schema forms. Forms render as dialogs in the UI with full validation.

**Feature flag:** Requires `featureFlags.pipeline = true` in global settings.

## Creating a Form

```
mcp__plugin_protolabs_studio__request_user_input({
  projectPath: "/path/to/project",
  title: "Form Title",
  description: "Optional subtitle",
  featureId: "optional-feature-id",
  ttlSeconds: 3600,  // 60-86400, default 3600
  steps: [
    {
      title: "Step Title",        // shown in wizard header (multi-step only)
      description: "Step desc",
      schema: { ... },            // JSON Schema draft-07
      uiSchema: { ... }          // @rjsf layout hints (optional)
    }
  ]
})
```

Returns `{ formId }`. Poll with `get_form_response({ formId })` to check status and retrieve the response.

## JSON Schema Patterns

### Radio Selection (enum + uiSchema)

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "decision": {
        "type": "string",
        "title": "Your Decision",
        "enum": ["approve", "deny"],
        "enumNames": ["Approve this change", "Deny this change"]
      }
    },
    "required": ["decision"]
  },
  "uiSchema": {
    "decision": { "ui:widget": "radio" }
  }
}
```

### Radio with Descriptions (oneOf)

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "title": "What should we do?",
        "oneOf": [
          { "const": "retry", "title": "Retry", "description": "Reset and re-run" },
          { "const": "skip", "title": "Skip", "description": "Mark as done without implementing" },
          { "const": "escalate", "title": "Escalate", "description": "Flag for manual review" }
        ]
      }
    },
    "required": ["action"]
  }
}
```

### Free Text Input

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "feedback": {
        "type": "string",
        "title": "Your Feedback",
        "description": "Tell us what you think"
      }
    }
  }
}
```

### Textarea (multiline)

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "notes": { "type": "string", "title": "Notes" }
    }
  },
  "uiSchema": {
    "notes": { "ui:widget": "textarea", "ui:options": { "rows": 5 } }
  }
}
```

### Number Input

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "count": { "type": "integer", "title": "How many?", "minimum": 1, "maximum": 10 }
    },
    "required": ["count"]
  }
}
```

### Checkbox (boolean)

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "confirmed": { "type": "boolean", "title": "I confirm this action" }
    },
    "required": ["confirmed"]
  }
}
```

### Select Dropdown

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "priority": {
        "type": "string",
        "title": "Priority",
        "enum": ["urgent", "high", "normal", "low"],
        "default": "normal"
      }
    }
  }
}
```

### Multi-Step Wizard

Pass multiple steps. Each step gets its own page with Back/Next/Submit navigation:

```json
{
  "steps": [
    {
      "title": "Step 1: Choose Action",
      "schema": {
        "type": "object",
        "properties": {
          "action": { "type": "string", "enum": ["create", "update", "delete"] }
        },
        "required": ["action"]
      }
    },
    {
      "title": "Step 2: Provide Details",
      "schema": {
        "type": "object",
        "properties": {
          "details": { "type": "string", "title": "Details" }
        }
      },
      "uiSchema": {
        "details": { "ui:widget": "textarea" }
      }
    }
  ]
}
```

### Dynamic Questions

Build schemas at runtime from data:

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "q1": { "type": "string", "title": "What is the target audience?" },
      "q2": { "type": "string", "title": "What integrations are needed?" }
    }
  }
}
```

## Polling for Response

```
mcp__plugin_protolabs_studio__get_form_response({ formId: "hitl-abc12345" })
```

Returns:
- `status: "pending"` — user hasn't responded yet
- `status: "submitted"` — `response` contains an object with the field values
- `status: "cancelled"` — user cancelled
- `status: "expired"` — TTL elapsed

## Other Tools

- `list_pending_forms({ projectPath })` — List all pending forms
- `submit_form_response({ formId, response: {...} })` — Answer a form programmatically (Ava only)
- `cancel_form({ formId })` — Cancel a pending form

## Best Practices

- Keep forms focused — 1-3 fields per step, 1-2 steps max
- Use `oneOf` with descriptions for complex choices (renders as rich radio cards)
- Use `enum` + `enumNames` for simple labeled options
- Set reasonable TTL — 600s for quick decisions, 3600s for review tasks, 86400s for async approval
- Always include `required` for mandatory fields
- Use `uiSchema` to control widget types (radio, textarea, etc.)
