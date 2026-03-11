# Phase 1: Server URL override in auth layer + app store

*Headless Server + Remote Client Architecture > Server URL Runtime Switching*

Modify getServerUrl() in apps/ui/src/lib/clients/auth.ts to check a runtime override stored in app-store before falling back to env vars. Add serverUrlOverride state + setServerUrlOverride action to app-store. Add recentServerUrls array (max 10) persisted via localStorage. When override changes, invalidate cached HTTP client and WebSocket connection, trigger reconnection. Add CORS middleware on server to accept requests from any origin when hivemind is enabled.

**Complexity:** medium

## Files to Modify

- apps/ui/src/lib/clients/auth.ts
- apps/ui/src/store/app-store.ts
- apps/ui/src/lib/http-api-client.ts
- apps/ui/src/lib/clients/base-http-client.ts
- apps/server/src/index.ts

## Acceptance Criteria

- [ ] getServerUrl() returns override when set, env var when not
- [ ] setServerUrlOverride() triggers WebSocket reconnection
- [ ] Recent URLs persisted and deduplicated in localStorage
- [ ] Server accepts CORS requests when hivemind enabled
- [ ] Build passes, no type errors