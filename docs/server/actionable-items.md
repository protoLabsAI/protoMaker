# Actionable items and HITL forms

The actionable items system provides a unified inbox for all user-attention items: HITL forms, approvals, notifications, escalations, and pipeline gates.

## Architecture

```
Event Sources                   Bridge                        Store
─────────────                   ──────                        ─────
hitl:form-requested     ──►
notification:created    ──► ActionableItemBridgeService ──► ActionableItemService
escalation:ui-notif     ──►                                  (disk-persistent)
pipeline:gate-waiting   ──►

                                                                │
                                                                ▼
                                            REST API (/api/actionable-items)
                                                                │
                                                                ▼
                                            UI (Inbox popover + /inbox page)
```

### Services

| Service                       | File                                         | Purpose                                                                            |
| ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ActionableItemService`       | `services/actionable-item-service.ts`        | CRUD, priority escalation, snooze, categories. Disk-persistent with atomic writes. |
| `ActionableItemBridgeService` | `services/actionable-item-bridge-service.ts` | Auto-creates ActionableItems from system events.                                   |
| `HITLFormService`             | `services/hitl-form-service.ts`              | Manages HITL form lifecycle. Disk-persistent.                                      |

## HITL form persistence

HITL forms are persisted to disk at `{projectPath}/.automaker/hitl-forms.json` using atomic writes (temp file then rename). The in-memory `Map` serves as a fast cache; disk is the source of truth on server restart.

### Lifecycle

```
create() ──► pending ──► submit() ──► submitted
                    ├──► cancel() ──► cancelled
                    └──► expire() ──► expired (TTL-based)
```

- **Default TTL**: 1 hour (configurable per form, max 24 hours)
- **Disk sync**: Every mutation (create, submit, cancel, expire) writes to disk
- **Startup recovery**: On service init, forms are loaded from disk for all known projects

### Dialog behavior

Closing the HITL dialog (clicking outside, pressing Escape) **defers** the form without cancelling it. The form remains `pending` on the server and can be reopened from the inbox.

- **Defer** (dialog close): Saves draft step data to localStorage, closes dialog
- **Cancel** (explicit button): Permanently cancels the form via the cancel endpoint
- **Draft persistence**: Partial form input is saved per `formId` in localStorage and restored when the dialog reopens

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

The global endpoint reads project paths from `SettingsService` and merges results via `Promise.allSettled` (resilient to individual project failures).

## WebSocket events

| Event                            | Payload              | Direction        |
| -------------------------------- | -------------------- | ---------------- |
| `actionable-item:created`        | `ActionableItem`     | Server to client |
| `actionable-item:status-changed` | `{ itemId, status }` | Server to client |

## Frontend

### Zustand store (`actionable-items-store.ts`)

The store manages both project-scoped and global items:

- **Project items**: `items`, `pendingCount`, `unreadCount`
- **Global items**: `globalItems`, `globalPendingCount`, `globalUnreadCount`
- **Filters**: `currentFilter` (pending, acted, dismissed, snoozed), `currentCategory`
- **Computed**: `getFilteredItems()`, `getItemsByCategory()`, `getUrgentCount()`

### Inbox page (`/inbox`)

Full-page inbox at the `/inbox` route with:

- Category tabs (All, HITL Forms, Approvals, Notifications, Escalations, Gates)
- Status filter pills (Pending, Snoozed, Acted, Dismissed)
- Item cards with priority badges, age indicators, action buttons
- Snooze picker (1h, 4h, tomorrow, custom)
- Bulk actions (dismiss all, mark all read)
- Click-to-open for HITL form items

#### Gate items

Gate items (`actionType === 'gate'`, `status === 'pending'`) render inline **Advance** and **Reject** buttons directly on the card. Clicking either:

1. Calls `POST /api/engine/pipeline/gate/resolve` with `{ projectPath, featureId, action: 'advance' | 'reject' }`
2. Dismisses the ActionableItem
3. Shows a success toast

This avoids a separate modal for the common case — the action is binary and irreversible, so an inline confirm-by-clicking pattern is sufficient.

#### Approval items

Approval items (`actionType === 'approval'`) open a **preview modal** on click. The modal:

1. Fetches the feature from `GET /api/features/:id` to display full spec context
2. Renders the feature title and scrollable description
3. Offers **Dismiss** (sets item status to dismissed) and **Approve** (calls `act` endpoint + dismisses)

The fetch happens at click time (not eagerly) so stale feature data is never shown.

### Sidebar badge aggregation

The sidebar has a **single Inbox nav item** that aggregates all user-attention signals into one badge count. This is intentional — the entry point is `Inbox`, not individual signal types.

**Pattern in `use-navigation.ts`:**

```typescript
const inboxCount = (unreadNotificationsCount ?? 0) + (unreadCeremonyCount ?? 0);
// Future: + urgentActionableCount, + escalationCount, etc.
```

**Why a single entry point:**

- Users don't mentally separate "notifications" from "ceremonies" from "gate approvals" — they think "what needs my attention?"
- Adding new signal sources (escalations, etc.) only requires updating the count expression, not adding nav items
- The `/inbox` page handles filtering by category once the user is inside

**Notification bell** (`notification-bell.tsx`) in the project switcher also routes to `/inbox` on click, not to `/notifications`. This ensures there's exactly one surface for all attention items.

### Browser notifications (`use-browser-notifications.ts`)

Mounted at the app root level. Two channels:

1. **Title badge** (always on): Prepends `(N)` to `document.title` when pending items exist
2. **Web Notification API** (opt-in): Shows browser notifications for new items when the tab is not focused. Controlled by `browserNotificationsEnabled` in the app store.

## ActionableItem type

```typescript
interface ActionableItem {
  id: string;
  projectPath: string;
  title: string;
  message?: string;
  category: string; // 'hitl-form' | 'approval' | 'notification' | 'escalation' | 'gate'
  actionType: string; // Specific action needed
  status: ActionableItemStatus; // 'pending' | 'acted' | 'dismissed' | 'snoozed' | 'expired'
  priority: 'low' | 'normal' | 'high' | 'urgent';
  read: boolean;
  createdAt: string;
  expiresAt?: string;
  snoozedUntil?: string;
  metadata?: Record<string, unknown>;
}
```

## Related

- [Route organization](./route-organization) — How server routes are structured
- [Utilities](./utilities) — Shared server utilities
