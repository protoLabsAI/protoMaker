# Inbox system

The unified inbox consolidates all user-attention signals into a single surface. HITL forms, approvals, pipeline gates, escalations, notifications, and ceremony entries all flow through the `ActionableItemService` and appear in a 4-tab UI.

## Architecture

```
Event Sources                   Bridge                        Store
--------------                  ------                        -----
hitl:form-requested     -->
notification:created    -->  ActionableItemBridgeService --> ActionableItemService
escalation:ui-notif     -->                                  (disk-persistent JSON)
pipeline:gate-waiting   -->
ceremony:fired          -->

                                                               |
                                                               v
                                                 REST API (/api/actionable-items)
                                                               |
                                                               v
                                                 UI (Inbox page + sidebar badge)
```

### Services

| Service                       | File                                                         | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `ActionableItemService`       | `apps/server/src/services/actionable-item-service.ts`        | CRUD, priority escalation, snooze. Disk-persistent, atomic writes. |
| `ActionableItemBridgeService` | `apps/server/src/services/actionable-item-bridge-service.ts` | Auto-creates actionable items from system events.                  |
| `HITLFormService`             | `apps/server/src/services/hitl-form-service.ts`              | HITL form lifecycle. Disk-persistent.                              |

## Item types

Each actionable item has an `actionType` that identifies what kind of attention is needed:

| Action Type    | Source                                | Tab         | User Action                        |
| -------------- | ------------------------------------- | ----------- | ---------------------------------- |
| `hitl_form`    | Agent needs human input               | Decisions   | Fill form, submit or cancel        |
| `approval`     | PRD or feature needs sign-off         | Decisions   | Preview spec, approve or dismiss   |
| `gate`         | Pipeline waiting at human gate        | Decisions   | Advance or reject (inline buttons) |
| `review`       | PR or artifact needs review           | Decisions   | Navigate to review surface         |
| `escalation`   | Critical signal from EscalationRouter | Escalations | Acknowledge, investigate           |
| `notification` | Informational update                  | All         | Read and dismiss                   |

**Type definition:** `ActionableItemActionType` in `libs/types/src/actionable-item.ts`

## Status lifecycle

```
pending --> snoozed --> pending (auto-resurface)
   |
   +--> acted
   +--> dismissed
   +--> expired (TTL-based)
```

| Status      | Description                                            |
| ----------- | ------------------------------------------------------ |
| `pending`   | Awaiting user action. Counts toward badge.             |
| `snoozed`   | Temporarily hidden. Auto-resurfaces at `snoozedUntil`. |
| `acted`     | User took action (submitted form, approved, etc.).     |
| `dismissed` | User explicitly dismissed without acting.              |
| `expired`   | TTL expired before user acted. Auto-set on read.       |

## Priority system

Items have a base priority (`low`, `medium`, `high`, `urgent`) that can escalate automatically as expiry approaches:

| Time to Expiry | Escalation Rule                     |
| -------------- | ----------------------------------- |
| > 30 minutes   | No change                           |
| 10-30 minutes  | `low` -> `medium`, others -> `high` |
| < 10 minutes   | All escalate to `urgent`            |
| Expired        | `urgent`                            |

Priority scoring is computed by `getEffectivePriority()` in `libs/types/src/actionable-item.ts`. Items are sorted by effective priority (highest first), then by creation date (newest first).

## Auto-bridge

The `ActionableItemBridgeService` subscribes to system events and auto-creates actionable items:

| Event                        | Creates Item Type | Priority | Notes                                |
| ---------------------------- | ----------------- | -------- | ------------------------------------ |
| `hitl:form-requested`        | `hitl_form`       | high     | Links to form via `formId`           |
| `notification:created`       | `notification`    | low      | Informational                        |
| `escalation:ui-notification` | `escalation`      | varies   | Maps escalation severity to priority |
| `pipeline:gate-waiting`      | `gate`            | high     | Links to feature via `featureId`     |
| `ceremony:fired`             | `notification`    | low      | Ceremony delivery status             |

## Auto-clear on feature unblock

When a feature transitions from `blocked` to `backlog` or `in_progress`, the system auto-dismisses associated actionable items. This prevents stale escalation and gate items from cluttering the inbox after the underlying issue is resolved.

The auto-dismiss is triggered by the `escalation:acknowledged` event subscriber in `event-subscriptions.module.ts`, which:

1. Finds the blocked feature associated with the deduplication key
2. Transitions the feature back to `backlog`
3. Dismisses any pending actionable items linked to that feature

## 4-tab UI

The inbox page (`/inbox`) organizes items into four tabs:

| Tab             | Contains                                     | Rationale                                              |
| --------------- | -------------------------------------------- | ------------------------------------------------------ |
| **All**         | Every pending item, including notifications  | Overview of everything needing attention               |
| **Decisions**   | `hitl_form` + `approval` + `gate` + `review` | Items requiring a human decision (approve/reject/fill) |
| **Escalations** | `escalation` items                           | Critical system signals needing investigation          |
| **Ceremonies**  | Ceremony-related notifications               | Project milestone and retro updates                    |

### Gate items

Gate items (`actionType === 'gate'`, `status === 'pending'`) render inline **Advance** and **Reject** buttons directly on the card. Clicking either:

1. Calls `POST /api/engine/pipeline/gate/resolve` with `{ projectPath, featureId, action: 'advance' | 'reject' }`
2. Dismisses the actionable item
3. Shows a success toast

### Approval items

Approval items (`actionType === 'approval'`) open a preview modal on click. The modal fetches the feature to display the full spec context, then offers **Dismiss** and **Approve** actions.

### Sidebar badge

A single Inbox nav item aggregates all user-attention signals into one badge count. This is intentional -- users think "what needs my attention?" not "which signal type needs me?"

The notification bell in the project switcher also routes to `/inbox` on click.

## REST API

All endpoints use POST with JSON body.

### Project-scoped

| Endpoint                                   | Body                                    | Description               |
| ------------------------------------------ | --------------------------------------- | ------------------------- |
| `POST /api/actionable-items/list`          | `{ projectPath }`                       | List items for a project  |
| `POST /api/actionable-items/act`           | `{ projectPath, itemId }`               | Mark item as acted        |
| `POST /api/actionable-items/dismiss`       | `{ projectPath, itemId }`               | Dismiss an item           |
| `POST /api/actionable-items/snooze`        | `{ projectPath, itemId, snoozedUntil }` | Snooze until timestamp    |
| `POST /api/actionable-items/dismiss-all`   | `{ projectPath }`                       | Dismiss all pending items |
| `POST /api/actionable-items/mark-read`     | `{ projectPath, itemId }`               | Mark item as read         |
| `POST /api/actionable-items/mark-all-read` | `{ projectPath }`                       | Mark all items as read    |

### Cross-project

| Endpoint                            | Body                                                    | Description                               |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `POST /api/actionable-items/global` | `{ includeActed?, includeDismissed?, includeExpired? }` | Aggregate items across all known projects |

## WebSocket events

| Event                            | Payload                    | Direction        |
| -------------------------------- | -------------------------- | ---------------- |
| `actionable-item:created`        | `ActionableItem`           | Server to client |
| `actionable-item:status-changed` | `{ itemId, status }`       | Server to client |
| `actionable-item:snoozed`        | `{ itemId, snoozedUntil }` | Server to client |

## Storage

Items are persisted per-project at `{projectPath}/.automaker/actionable-items.json`. The file uses atomic writes (temp file + rename) for reliability. Schema version is tracked for future migrations.

```json
{
  "version": 1,
  "items": [
    {
      "id": "uuid",
      "actionType": "escalation",
      "priority": "high",
      "title": "Agent stuck on feature-123",
      "message": "Feature has been in_progress for 4 hours with no agent activity",
      "createdAt": "2026-03-03T10:00:00Z",
      "status": "pending",
      "read": false,
      "actionPayload": { "featureId": "feature-123" },
      "projectPath": "/path/to/project"
    }
  ]
}
```

## Browser notifications

The `use-browser-notifications.ts` hook (mounted at app root) provides two notification channels:

1. **Title badge** (always on): Prepends `(N)` to `document.title` when pending items exist
2. **Web Notification API** (opt-in): Shows browser notifications for new items when the tab is not focused. Controlled by `browserNotificationsEnabled` in the app store.

## Key files

| File                                                         | Purpose                            |
| ------------------------------------------------------------ | ---------------------------------- |
| `libs/types/src/actionable-item.ts`                          | Type definitions, priority scoring |
| `apps/server/src/services/actionable-item-service.ts`        | CRUD service, disk persistence     |
| `apps/server/src/services/actionable-item-bridge-service.ts` | Event-to-item auto-bridge          |
| `apps/server/src/services/hitl-form-service.ts`              | HITL form lifecycle                |
| `apps/ui/src/store/actionable-items-store.ts`                | Zustand store                      |
| `apps/ui/src/hooks/use-browser-notifications.ts`             | Browser notification integration   |

## Related

- [Actionable items (server reference)](../server/actionable-items) -- REST API and HITL form details
- [Escalation routing](../agents/escalation-routing) -- How escalation signals create inbox items
- [Agile ceremonies](../agents/ceremonies) -- How ceremony events create inbox items
- [Idea to production](./idea-to-production) -- Pipeline gates that create inbox items
