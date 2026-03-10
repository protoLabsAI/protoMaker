# Phase 2: Server Connection section in Developer Settings

*Headless Server + Remote Client Architecture > Server URL Runtime Switching*

Add a Server Connection section to developer-section.tsx with: (1) text input for server URL with a Connect button, (2) dropdown/list of recent connections showing URL + last-connected timestamp, (3) connection status indicator (connected/disconnected/connecting), (4) current server info display (instance name, role, version from /api/health). Clicking a recent connection auto-fills and connects. Clear button to remove from history.

**Complexity:** medium
**Dependencies:** auth-layer-url-override

## Files to Modify

- apps/ui/src/components/views/settings-view/developer/developer-section.tsx
- apps/ui/src/store/app-store.ts

## Acceptance Criteria

- [ ] Can enter a server URL and connect to it
- [ ] Recent connections shown with timestamps
- [ ] Connection status indicator updates in real-time
- [ ] Shows connected server instance name and role
- [ ] Clearing a recent URL removes it from history
- [ ] Switching servers re-authenticates properly