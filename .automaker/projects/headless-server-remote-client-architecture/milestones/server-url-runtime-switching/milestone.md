# Server URL Runtime Switching

*Part of: Headless Server + Remote Client Architecture*

Add runtime server URL override to auth layer and a Server Connection section in Developer Settings with recent connection history.

**Status:** undefined

## Phases

### 1. Server URL override in auth layer + app store

Modify getServerUrl() in apps/ui/src/lib/clients/auth.ts to check a runtime override stored in app-store before falling back to env vars. Add serverUrlOverride state + setServerUrlOverride action to app-store. Add recentServerUrls array (max 10) persisted via localStorage. When override changes, invalidate cached HTTP client and WebSocket connection, trigger reconnection. Add CORS middleware on server to accept requests from any origin when hivemind is enabled.

**Complexity:** medium

**Files:**
- apps/ui/src/lib/clients/auth.ts
- apps/ui/src/store/app-store.ts
- apps/ui/src/lib/http-api-client.ts
- apps/ui/src/lib/clients/base-http-client.ts
- apps/server/src/index.ts

**Acceptance Criteria:**
- [ ] getServerUrl() returns override when set, env var when not
- [ ] setServerUrlOverride() triggers WebSocket reconnection
- [ ] Recent URLs persisted and deduplicated in localStorage
- [ ] Server accepts CORS requests when hivemind enabled
- [ ] Build passes, no type errors

### 2. Server Connection section in Developer Settings

Add a Server Connection section to developer-section.tsx with: (1) text input for server URL with a Connect button, (2) dropdown/list of recent connections showing URL + last-connected timestamp, (3) connection status indicator (connected/disconnected/connecting), (4) current server info display (instance name, role, version from /api/health). Clicking a recent connection auto-fills and connects. Clear button to remove from history.

**Complexity:** medium

**Files:**
- apps/ui/src/components/views/settings-view/developer/developer-section.tsx
- apps/ui/src/store/app-store.ts

**Acceptance Criteria:**
- [ ] Can enter a server URL and connect to it
- [ ] Recent connections shown with timestamps
- [ ] Connection status indicator updates in real-time
- [ ] Shows connected server instance name and role
- [ ] Clearing a recent URL removes it from history
- [ ] Switching servers re-authenticates properly

### 3. Instance name indicator + quick toggle in bottom panel

Add the connected instance name (from /api/health response) to the BottomPanel status bar in apps/ui/src/components/layout/bottom-panel/bottom-panel.tsx. Display it as a clickable badge next to the system health indicator showing the instance name (e.g. 'Dev Server', 'Staging'). Clicking it opens a quick-switch dropdown listing recent connections and online hivemind peers. The dropdown allows one-click server switching without navigating to settings. If no instance name is available, show the server URL hostname. Use the Server lucide icon. Tooltip shows full URL, instance role, and connection status.

**Complexity:** medium

**Files:**
- apps/ui/src/components/layout/bottom-panel/bottom-panel.tsx
- apps/ui/src/store/app-store.ts

**Acceptance Criteria:**
- [ ] Instance name shown in bottom panel status bar
- [ ] Clicking opens quick-switch dropdown with recent connections
- [ ] Dropdown shows online hivemind peers when available
- [ ] Selecting an entry switches server connection
- [ ] Falls back to hostname when no instance name configured
- [ ] Tooltip shows full URL, role, and status
