# Correlated Events API

Query and trace event chains through the in-memory correlated event store. Every event emitted through the event bus is automatically stored with correlation metadata, enabling full causal chain reconstruction for debugging.

## Overview

The event store is an in-memory ring buffer (10,000 events, FIFO eviction). Events are transient and lost on server restart. For persistent event storage, see the Event Ledger (JSONL-based).

Each stored event includes:

| Field           | Type     | Description                                    |
| --------------- | -------- | ---------------------------------------------- |
| `eventId`       | `string` | UUID v4, unique per event                      |
| `correlationId` | `string` | UUID v4, shared across a causal chain          |
| `causationId`   | `string` | eventId of the direct parent (optional)        |
| `topic`         | `string` | Event type (e.g. `feature:started`)            |
| `payload`       | `object` | Event data                                     |
| `timestamp`     | `number` | Epoch milliseconds                             |
| `source`        | `string` | Service that emitted (e.g. `github-webhook`)   |

## Endpoints

### Query Events

```
GET /api/ops/events
```

**Query Parameters:**

| Parameter       | Type     | Default | Description                              |
| --------------- | -------- | ------- | ---------------------------------------- |
| `correlationId` | `string` | -       | Filter by correlation ID (exact)         |
| `featureId`     | `string` | -       | Filter by feature ID (searches payloads) |
| `topic`         | `string` | -       | Filter by event topic (exact)            |
| `since`         | `number` | -       | Lower bound timestamp (epoch ms)         |
| `until`         | `number` | -       | Upper bound timestamp (epoch ms)         |
| `limit`         | `number` | 100     | Max events to return                     |
| `offset`        | `number` | 0       | Pagination offset                        |

**Response:**

```json
{
  "success": true,
  "events": [
    {
      "eventId": "a1b2c3d4-...",
      "correlationId": "e5f6g7h8-...",
      "causationId": null,
      "topic": "webhook:github:pull_request",
      "payload": { "prNumber": 42, "featureId": "auth-login" },
      "timestamp": 1711929600000,
      "source": "github-webhook"
    }
  ],
  "total": 1,
  "storeSize": 4523
}
```

### Get Event Chain

```
GET /api/ops/events/chain/:correlationId
```

Returns all events sharing a correlation ID, ordered by timestamp, with chain metadata.

**Response:**

```json
{
  "success": true,
  "chain": {
    "correlationId": "e5f6g7h8-...",
    "events": [
      { "eventId": "a1", "topic": "webhook:github:pull_request", "timestamp": 1000, "source": "github-webhook" },
      { "eventId": "a2", "topic": "feature:started", "timestamp": 1050, "causationId": "a1", "source": "lead-engineer-service" },
      { "eventId": "a3", "topic": "feature:completed", "timestamp": 5000, "causationId": "a2", "source": "auto-mode-service" }
    ],
    "startTime": 1000,
    "endTime": 5000,
    "duration": 4000
  }
}
```

Returns 404 if no events match the correlation ID.

## How Correlation Works

### Chain Propagation

When a service receives an event and triggers downstream actions, correlation context flows automatically:

1. **External trigger** (e.g. GitHub webhook) generates a new `correlationId`
2. The service sets correlation context on the event emitter via `setCorrelationContext()`
3. All events emitted during that handler share the same `correlationId`
4. Downstream services (LeadEngineerService, AutoModeService) inherit the context
5. Context is cleared after processing completes

### Services with Correlation Support

| Service                  | Role                                           |
| ------------------------ | ---------------------------------------------- |
| GitHub Webhook Handler   | Generates new correlationId per delivery       |
| LeadEngineerService      | Inherits or generates correlationId per feature |
| AutoModeService          | Inherits or generates correlationId per exec    |
| MaintenanceOrchestrator  | Generates new correlationId per sweep           |

### Deviation Rules

- **No parent causationId available**: Event is emitted with eventId and correlationId; causationId is left undefined.
- **Ring buffer at capacity**: Oldest event is evicted (FIFO). A warning is logged once.
- **Event without correlationId**: Treated as a new chain start with a freshly generated correlationId.
- **Multiple events from same handler**: All share the same correlationId; each gets a unique eventId.
- **External system event**: Creates a new correlationId with source named explicitly (e.g. `github-webhook`).
