---
tags: [auth]
summary: auth implementation decisions and patterns
relevantTo: [auth]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 53
  referenced: 22
  successfulFeatures: 22
---
<!-- domain: Authentication & Authorization | OAuth, token management, access control -->

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

#### [Pattern] Layered fallback chain for server URL: `localStorage` (user override) → `Electron IPC cache` (last known good) → `env vars` (deploy-time). Each layer is checked in order; first non-null wins. (2026-03-10)
- **Problem solved:** App must support user-set overrides (dev/testing) while maintaining safe defaults (prod, Electron context).
- **Why this works:** Resilience: if one source is unavailable/corrupted, app doesn't crash. User preference (localStorage) is checked first, so user can override env vars. Graceful degradation.
- **Trade-offs:** Simple to implement, but source of truth shifts at runtime. Code cannot assume `getServerUrl()` takes the same path twice (localStorage might be cleared between calls). Potential for subtle bugs if caller assumes consistency.

### Server URL override checked in auth layer before falling back to cached/env values (2026-03-10)
- **Context:** Need to support runtime server URL override that survives page reloads while maintaining fallback to default config
- **Why:** localStorage provides client-side persistence without network round trips. Placing override check in auth.ts getServerUrl() ensures any caller automatically gets override if set, without needing to thread it through component props
- **Rejected:** Alternative: separate config service (requires dependency injection everywhere) or URL params (not persistent, verbose). Could store on server (requires auth + network call, complexity)
- **Trade-offs:** Simple and automatic for consumers, but tightly couples auth layer to runtime config concerns. localStorage is per-origin, won't work across different ports/domains without CORS setup
- **Breaking if changed:** Removing localStorage check removes override capability. Persisting auth state across page reloads relies on getServerUrl() being called at startup before any connections are made

### Override mechanism uses localStorage key `'automaker:serverUrlOverride'` checked first in `getServerUrl()` fallback chain before environment variables (2026-03-10)
- **Context:** Need to allow runtime server URL changes without environment redeploy or page reload
- **Why:** localStorage survives page reload but is volatile (cleared on browser data clear), so it's safe for transient overrides. Key-based lookup is faster than parsing config objects
- **Rejected:** Session storage (lost on tab close); IndexedDB (overkill); URL params (exposed in history)
- **Trade-offs:** Easier: simple string key, no serialization. Harder: no version control, survives across sessions unintentionally
- **Breaking if changed:** If localStorage key is renamed without migration, users lose saved override. If storage cleared (browser settings), override disappears silently

#### [Gotcha] Service checks agent trust tier but NOT the human/caller requesting the action. Assumes caller is already authorized to submit proposals (2026-03-10)
- **Situation:** Who authorized the caller to request this action?
- **Root cause:** Delegation: authority-service only enforces agent capability, not human authority. Caller must validate first.
- **How to avoid:** Cleaner separation of concerns but creates implicit contract: caller must validate authorization before calling

### Use localStorage for persistent server configuration (serverUrlOverride, recentServerUrls) instead of backend storage (2026-03-10)
- **Context:** Server URL selection happens during app initialization before establishing server connection; users need offline capability
- **Why:** Avoids chicken-and-egg problem: cannot persist to server if you don't know which server to connect to. Client-side persistence enables offline use.
- **Rejected:** Backend persistence would require bootstrapping with a default server URL, creating initialization ordering issues
- **Trade-offs:** Simpler, faster, works offline, but configuration doesn't sync across devices or persist after localStorage clear
- **Breaking if changed:** Moving to backend storage requires solving initialization sequence (how to know server URL before connecting); removing localStorage loses offline capability