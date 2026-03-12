---
name: hitl-management
emoji: 🔔
description: Ava's operational workflow for managing pending HITL forms. Use when forms are pending, agents are blocked waiting for input, or clearing the forms inbox during headsdown. Trigger on "pending forms", "HITL", "blocked waiting for input", "forms inbox", or "user input request".
metadata:
  author: ava
  created: 2026-02-27T00:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [ava, hitl, forms, actionable-items, operations, headsdown]
  source: designed
  avaOnly: true
---

# HITL Management — Ava Operational Workflow

These tools are scoped to Ava for operational use during headsdown sessions. Code agents implementing features do NOT use these — they use `request_user_input` and `get_form_response` instead.

## When to Check for Pending Forms

Check at the start of every headsdown session and after any feature moves to `blocked`:

1. `list_pending_forms` — enumerate open forms across the project
2. `list_actionable_items` — check the unified inbox for gates, escalations, approvals

If no pending forms exist, continue normal work loop.

## Tool Reference

### `list_pending_forms`

Lists all pending (unanswered) HITL forms for the project.

```
list_pending_forms({ projectPath })
```

Returns: `[ { formId, title, featureId, featureTitle, expiresAt, callerType, stepCount } ]`

**When to use:** Start of headsdown session, after a feature hits `blocked`, after ESCALATE fires.

---

### `submit_form_response`

Programmatically answer a pending HITL form. Use when the answer is unambiguous (e.g., an escalation form where the right resolution is clear).

```
submit_form_response({
  projectPath,
  formId,
  response: { stepIndex: 0, value: 'retry' }  // or 'provide_context' | 'skip' | 'close'
})
```

**When to use:**

- ESCALATE forms where the resolution is clear (retry a transient failure, skip an already-done feature)
- Forms that have been pending past their TTL/2 reminder and the answer is obvious from context

**Do NOT use when:** The form requires user judgement (a PM review, a spec approval, a content decision). Route those to Josh via Discord DM instead.

---

### `cancel_form`

Cancel a pending form that is no longer relevant (e.g., the feature was manually closed, the agent restarted with fresh context).

```
cancel_form({ projectPath, formId })
```

**When to use:** Feature moved to `done` manually, form is stale from a previous session, form was created in error.

---

### `list_actionable_items`

List items in the unified inbox — HITL forms, pipeline gates, escalations, approvals.

```
list_actionable_items({
  projectPath,
  category: 'forms' | 'escalations' | 'gates' | 'approvals'  // optional filter
})
```

**When to use:** At the start of headsdown to get a full picture of what needs human attention. Check `category: 'gates'` specifically if features are stuck in `review`.

---

### `act_on_actionable_item`

Update the status of an actionable item.

```
act_on_actionable_item({
  projectPath,
  itemId,
  action: 'acted' | 'dismissed' | 'snoozed',
  snoozeUntil?: ISO8601  // required for 'snoozed'
})
```

**When to use:**

- `acted` — after submitting the corresponding form or resolving the gate
- `dismissed` — stale notification that no longer requires action
- `snoozed` — defer a low-priority item until a specific time (e.g., snooze a non-critical escalation until after current sprint)

---

## Escalation HITL Forms (from EscalateProcessor)

When a feature is blocked and auto-retry does not fire, the system creates a structured HITL form with four options:

| Option           | Value             | When to use                                                  |
| ---------------- | ----------------- | ------------------------------------------------------------ |
| Retry            | `retry`           | Transient failure, environment issue, or agent timeout       |
| Provide context  | `provide_context` | Agent was missing information — provide it as follow-up text |
| Skip             | `skip`            | Feature is already done, duplicate, or out of scope          |
| Close as blocked | `close`           | Requires Josh's attention — route to Discord instead         |

For `provide_context`, the form has a second step — submit a follow-up `submit_form_response` call with `stepIndex: 1` and the context text.

---

## Headsdown Session Checklist

At the start of each headsdown session:

```
1. list_pending_forms({ projectPath })      → any pending forms?
2. list_actionable_items({ projectPath })   → any gates or escalations?
3. For each pending form:
   - If ESCALATE form + retryable → submit_form_response with 'retry'
   - If ESCALATE form + needs context → submit with 'provide_context'
   - If gate + approval obvious → act_on_actionable_item 'acted'
   - If requires Josh judgement → send Discord DM to Josh, snooze item
4. Continue normal headsdown work loop
```
