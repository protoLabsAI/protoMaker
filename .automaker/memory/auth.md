---
tags: [auth]
summary: auth implementation decisions and patterns
relevantTo: [auth]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 22
  referenced: 4
  successfulFeatures: 4
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

### All ceremony endpoints require X-API-Key header authentication, even read operations (GET /api/ceremonies/status) (2026-02-24)
- **Context:** New observability endpoints follow existing authentication pattern in the codebase
- **Why:** Consistent with existing API security model. Ceremony state is sensitive operational data - even status should be restricted to authenticated clients.
- **Rejected:** Leaving status endpoint unauthenticated would violate security consistency and expose internal state
- **Trade-offs:** Simpler integration for internal tools that have API key, but requires all consumers to manage credentials
- **Breaking if changed:** Unauthenticated requests to either endpoint return 401/403; any client expecting unauthenticated status access will fail

#### [Pattern] NPM_TOKEN injected at workflow runtime via GitHub Secrets, using `.npmrc` echo pattern (`echo "//registry.npmjs.org/:_authToken=..." >> .npmrc`) (2026-02-25)
- **Problem solved:** CI/CD workflow needs to authenticate to npm registry for publishing. Token must not be stored in repo.
- **Why this works:** GitHub Secrets are (1) rotatable without code changes, (2) auditable in audit logs, (3) scoped to repository, (4) never exposed in logs. Injecting at runtime via environment variable + shell redirection is the GitHub Actions standard pattern.
- **Trade-offs:** Secure: token rotation doesn't require code change. Slightly fragile: workflow fails silently if secret is missing (no error message, just 401 Unauthorized).

### User identity is manually entered string, not derived from session/auth system. Stored in app-store (memory) + API (persistent). (2026-02-25)
- **Context:** No auth context available (or not wired) to auto-populate user name. Requires explicit user input on first use.
- **Why:** Simplest implementation that doesn't require auth system integration. User enters their name once, cached for session. Works for multi-workspace scenarios.
- **Rejected:** Auto-detect from: (1) localStorage (no persistence across browsers), (2) auth provider (requires auth setup), (3) server session (requires login).
- **Trade-offs:** Manual entry is flexible (works without auth) but creates friction (extra dialog on first click). Auto-detection would be seamless but requires auth dependency.
- **Breaking if changed:** If removed and switched to localStorage-only: loses persistence across browser clears and devices. Switch to auto-auth-detect: requires auth system, breaks in unauth contexts.

#### [Pattern] Source determination via request header inspection: X-Automaker-Client header → 'mcp' (tier 4), X-API-Key header → 'api' (tier 1), session token in cookie or X-Session-Token → 'ui' (tier 3), default → 'internal' (tier 4). (2026-02-25)
- **Problem solved:** Multiple authentication paths (MCP plugin, REST API key, web UI session, internal service-to-service) need to be distinguished to assign appropriate trust tier and validation level.
- **Why this works:** Headers are available before authentication middleware (which may not run in all paths). Allows differentiation of origin without requiring full auth context object. Explicit header parsing makes source determination visible in code.
- **Trade-offs:** Header-based approach is fragile (missing header defaults to internal = tier 4, potentially over-permissive). Alternative (explicit auth middleware) is more robust but heavier and breaks MCP plugin architecture.