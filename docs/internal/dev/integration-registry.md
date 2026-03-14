# Integration Registry

Unified registry for external integrations (Discord, GitHub, etc.).

## Overview

The integration registry provides a single source of truth for all external connections. Each integration is described by an `IntegrationDescriptor` — a serializable manifest that declares its config fields, category, scope, icon, and health check capability.

## Architecture

Uses an in-memory Map with Zod validation, tier 0/1 protection, and event emission.

### Key Files

| File                                                       | Purpose                                                |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `libs/types/src/integration.ts`                            | Zod schemas and TypeScript types                       |
| `apps/server/src/services/integration-registry-service.ts` | Registry service (register, get, list, health, toggle) |
| `apps/server/src/services/built-in-integrations.ts`        | 4 built-in descriptors + health check wiring           |
| `apps/server/src/routes/integrations/index.ts`             | API endpoints (existing + registry)                    |
| `apps/ui/src/components/views/settings-view/integrations/` | UI components                                          |

## Categories

| Category         | Description            | Phase 1 Integrations |
| ---------------- | ---------------------- | -------------------- |
| `communication`  | Chat and notifications | Discord              |
| `source-control` | Git and CI             | GitHub               |
| `streaming`      | Live coding            | —                    |
| `ai-provider`    | LLM providers          | Phase 2              |
| `tooling`        | MCP servers            | Phase 2              |
| `observability`  | Tracing/metrics        | Phase 2              |

## API Endpoints

All endpoints are POST and require auth middleware.

| Endpoint                            | Body              | Returns                                  |
| ----------------------------------- | ----------------- | ---------------------------------------- |
| `/api/integrations/registry/list`   | `{ category? }`   | `{ integrations: IntegrationSummary[] }` |
| `/api/integrations/registry/get`    | `{ id }`          | `{ integration, health? }`               |
| `/api/integrations/registry/health` | `{ id? }`         | `{ health: IntegrationHealth[] }`        |
| `/api/integrations/registry/toggle` | `{ id, enabled }` | `{ success }`                            |

## Health Statuses

| Status         | Meaning              | Badge Color |
| -------------- | -------------------- | ----------- |
| `connected`    | Working normally     | Green       |
| `disconnected` | Cannot reach service | Zinc/Gray   |
| `degraded`     | Partially working    | Amber       |
| `unconfigured` | No config provided   | Zinc/Gray   |
| `disabled`     | Toggled off          | Zinc/Gray   |

## Adding a New Integration

1. Create descriptor in `built-in-integrations.ts` (or via API for user-defined)
2. Register health check function if applicable
3. The UI automatically renders the card and config dialog from the descriptor's `configFields`

## Config Field Types

| Type      | UI Render                         |
| --------- | --------------------------------- |
| `string`  | Text input                        |
| `secret`  | Password input with reveal toggle |
| `boolean` | Switch toggle                     |
| `number`  | Number input                      |
| `url`     | URL input                         |
| `select`  | Dropdown select                   |

Fields support optional `group` property for visual grouping in the config dialog.
