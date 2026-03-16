# PRD: Service Hardening: Route Validation & Timeout Config

## Situation

The Automaker server has 16+ Express route handlers that use TypeScript `as` type assertions on `req.body` without runtime validation. Additionally, 40+ timeout/delay constants are hardcoded across services with no environment variable overrides. Five P0 reliability fixes from the same audit have already shipped to dev.

## Problem

1. **Type assertions are not runtime validation.** `req.body as { projectPath: string }` compiles but doesn't actually check the value at runtime. Malformed requests pass through silently, causing downstream errors that are hard to diagnose. This is especially risky on webhook routes that accept external payloads.

2. **Hardcoded timeouts prevent operational flexibility.** Values like 30-minute execution timeouts, 60-second merge retry delays, and 5-minute polling intervals are baked into service code. Changing them requires a code change and redeploy, when they should be tunable per environment.

## Approach

**Milestone 1 — Route Validation Foundation:** Create a Zod-based validation middleware and shared schema library. Apply it to the highest-risk routes first (webhooks, feature CRUD, project CRUD).

**Milestone 2 — Timeout Configuration:** Create a central `timeouts.ts` config module that reads from environment variables with sensible defaults. Update services to import from this module instead of defining their own constants.

## Results

- All route handlers validate request bodies at runtime using Zod schemas
- A shared validation middleware pattern that new routes adopt automatically
- All critical timeouts configurable via environment variables
- Single source of truth for timeout defaults
- No behavioral changes — existing default values preserved

## Constraints

Zod is already a dependency (used in settings validation) — no new deps needed,Must preserve all existing default timeout values to avoid behavioral changes,Route validation errors must return 400 with descriptive messages, not 500,Cannot break existing MCP tool contracts — response shapes must stay identical,Each phase must independently pass build + tests
