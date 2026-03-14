# Calendar API

HTTP API for calendar event management, Google Calendar sync, and event aggregation.

## Overview

The calendar system aggregates events from multiple sources into a unified view:

- **Custom events** -- user-created events stored in `.automaker/calendar.json`
- **Feature due dates** -- auto-derived from features with `dueDate` set
- **Google Calendar** -- OAuth-synced events from Google Calendar

All endpoints are `POST` and require `projectPath` in the request body.

## Event types

| Type        | Source | Description                     |
| ----------- | ------ | ------------------------------- |
| `custom`    | User   | Created via API or UI           |
| `feature`   | Auto   | Features with a `dueDate` field |
| `milestone` | Auto   | Project milestone dates         |
| `google`    | Sync   | Synced from Google Calendar     |

## Endpoints

### POST /api/calendar/list

Query events with optional date range and type filters.

**Request:**

```json
{
  "projectPath": "/path/to/project",
  "startDate": "2026-03-01",
  "endDate": "2026-03-31",
  "types": ["custom", "feature"]
}
```

All fields except `projectPath` are optional. Omitting `startDate`/`endDate` returns all events. Omitting `types` returns all types.

**Response:**

```json
{
  "success": true,
  "events": [
    {
      "id": "uuid",
      "title": "Sprint review",
      "date": "2026-03-15",
      "endDate": "2026-03-15",
      "type": "custom",
      "description": "End of sprint demo",
      "color": "#4f46e5",
      "url": null,
      "sourceId": null,
      "createdAt": "2026-03-01T00:00:00.000Z",
      "updatedAt": "2026-03-01T00:00:00.000Z"
    }
  ]
}
```

### POST /api/calendar/create

Create a custom calendar event.

**Request:**

```json
{
  "projectPath": "/path/to/project",
  "title": "Sprint review",
  "date": "2026-03-15",
  "type": "custom",
  "endDate": "2026-03-15",
  "description": "End of sprint demo",
  "color": "#4f46e5",
  "url": "https://example.com"
}
```

Required fields: `projectPath`, `title`, `date`, `type`. All others are optional.

**Response:**

```json
{
  "success": true,
  "event": { "id": "uuid", "title": "Sprint review", "...": "..." }
}
```

### POST /api/calendar/update

Update an existing event. Only include fields you want to change.

**Request:**

```json
{
  "projectPath": "/path/to/project",
  "id": "event-uuid",
  "title": "Updated title",
  "date": "2026-03-16"
}
```

Required fields: `projectPath`, `id`. All other fields are optional -- only provided fields are updated. The server destructures `{ projectPath, id, ...updates }` so fields are flattened at the top level (not nested under an `updates` key).

**Response:**

```json
{
  "success": true,
  "event": { "id": "event-uuid", "title": "Updated title", "...": "..." }
}
```

### POST /api/calendar/delete

Delete a calendar event by ID.

**Request:**

```json
{
  "projectPath": "/path/to/project",
  "id": "event-uuid"
}
```

**Response:**

```json
{
  "success": true
}
```

## Google Calendar integration

OAuth-based read-only sync from Google Calendar. Endpoints live under `/api/google-calendar/`.

### OAuth flow

1. `GET /api/google-calendar/authorize` -- redirects the user to Google OAuth consent screen
2. `GET /api/google-calendar/callback` -- exchanges the auth code for tokens, stores them in project settings
3. `POST /api/google-calendar/status` -- check connection status (`{ connected, email, hasClientCredentials }`)
4. `POST /api/google-calendar/revoke` -- disconnect and clear stored tokens
5. `POST /api/google-calendar/sync` -- trigger a one-time sync (90-day window: 30 days back, 60 days forward)

### Sync behavior

- Events are upserted using `sourceId` (Google event ID) for deduplication
- Cancelled events are skipped
- Dates are normalized to `YYYY-MM-DD` format
- Access tokens auto-refresh when expired (5-minute buffer)

### Required environment variables

| Variable               | Description                |
| ---------------------- | -------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

These are configured in the Google Cloud Console under "OAuth 2.0 Client IDs" with the callback URL set to `{origin}/api/google-calendar/callback`.

## MCP tools

Four MCP tools provide programmatic access for agents:

| Tool                    | Description                                   |
| ----------------------- | --------------------------------------------- |
| `list_calendar_events`  | Query events with date range and type filters |
| `create_calendar_event` | Create a custom event                         |
| `update_calendar_event` | Update an existing event                      |
| `delete_calendar_event` | Delete an event                               |

The calendar assistant agent (`/calendar-assistant`) has exclusive write access to these tools. Other agents delegate calendar operations via the `/calendar-assistant` CLI skill.

## Storage

Custom events are persisted in `.automaker/calendar.json`:

```json
{
  "events": [
    {
      "id": "uuid",
      "title": "Event title",
      "date": "2026-03-15",
      "type": "custom",
      "createdAt": "2026-03-01T00:00:00.000Z",
      "updatedAt": "2026-03-01T00:00:00.000Z"
    }
  ]
}
```

Writes use `atomicWriteJson` with 3-backup rotation and automatic recovery from corrupted files. In multi-instance mode, calendar events are broadcast via the peer mesh for cross-instance sync.

## Reminder events

`CalendarService` exposes a programmatic reminder API used by the job execution layer to trigger reactive agent spawning when a calendar event is due.

### CalendarReminderPayload

```typescript
interface CalendarReminderPayload {
  title: string;
  description: string;
  event: CalendarEvent;
}
```

### Methods

| Method                  | Description                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `onReminder(callback)`  | Subscribe to `calendar:reminder` events. Backed by a Node.js `EventEmitter`.                                |
| `emitReminder(payload)` | Fire a `calendar:reminder` event for a due calendar event. Called by `JobExecutorService` when a job fires. |

The wiring in `services.ts` connects these events to `ReactiveSpawnerService.spawnForCron()`, so calendar-based reminders benefit from the same rate-limiting and circuit-breaking budget controls as recurring cron tasks. See [ReactiveSpawnerService](./reactive-spawner) for details.

## Architecture

```
CalendarService (singleton)
  ├── Custom events     ← .automaker/calendar.json
  ├── Feature due dates ← FeatureLoader
  └── Google events     ← GoogleCalendarSyncService
```

The service aggregates all sources in `listEvents()`, filters by date range and type, and returns a unified `CalendarEvent[]`.

## Related

- **[MCP tools reference](../integrations/mcp-tools-reference)** -- full tool listing
- **[Plugin commands](../integrations/plugin-commands)** -- `/calendar-assistant` command
- **[Feature flags](../dev/feature-flags)** -- calendar is now GA (always enabled)
