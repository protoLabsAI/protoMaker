---
tags: [auth]
summary: auth implementation decisions and patterns
relevantTo: [auth]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 6
  referenced: 1
  successfulFeatures: 1
---
# auth

#### [Gotcha] OAuth token stored as nested path in settings (integrations.linear.agentToken) requires specific path string, not object traversal (2026-02-12)
- **Situation:** Implementation reads token from settings using exact path string. Easy to mistype the path or assume different structure.
- **Root cause:** Project settings use dot-notation path strings for nested configuration values. This is consistent with settings service implementation pattern
- **How to avoid:** String-based paths are error-prone (typos break silently) but consistent with existing settings service pattern across codebase

#### [Gotcha] HTTP endpoint mounted after global auth middleware - ALL endpoints in that router require authentication, cannot be overridden at endpoint level (2026-02-15)
- **Situation:** Tried to verify `/api/copilotkit/workflows` endpoint exists without auth. Got 401 as expected, but couldn't quickly test endpoint without setting up auth token.
- **Root cause:** CopilotKit routes mounted at line 922 in server index.ts, AFTER `app.use(authenticate)` middleware (line ~900). Express middleware chains apply to all subsequent routes unless explicitly skipped.
- **How to avoid:** Easier: consistent auth for all copilotkit endpoints, no accidental public endpoints. Harder: cannot create public metadata endpoint without refactoring middleware chain.

#### [Pattern] Token refresh uses proactive 5-minute expiration buffer rather than on-demand refresh. When token expires within 5 minutes, automatically refresh using refreshToken before API call. (2026-02-22)
- **Problem solved:** OAuth tokens expire; must decide when to refresh to balance API calls against operation reliability.
- **Why this works:** Proactive refresh prevents cascading failures where API calls fail mid-operation due to expired token. 5-minute buffer provides margin for network delays.
- **Trade-offs:** Uses more token refresh API calls, but eliminates user-facing failures. Storage of refreshToken required (accepted complexity).