# Phase 3: Instance name indicator + quick toggle in bottom panel

*Headless Server + Remote Client Architecture > Server URL Runtime Switching*

Add the connected instance name (from /api/health response) to the BottomPanel status bar in apps/ui/src/components/layout/bottom-panel/bottom-panel.tsx. Display it as a clickable badge next to the system health indicator showing the instance name (e.g. 'Dev Server', 'Staging'). Clicking it opens a quick-switch dropdown listing recent connections and online hivemind peers. The dropdown allows one-click server switching without navigating to settings. If no instance name is available, show the server URL hostname. Use the Server lucide icon. Tooltip shows full URL, instance role, and connection status.

**Complexity:** medium
**Dependencies:** auth-layer-url-override

## Files to Modify

- apps/ui/src/components/layout/bottom-panel/bottom-panel.tsx
- apps/ui/src/store/app-store.ts

## Acceptance Criteria

- [ ] Instance name shown in bottom panel status bar
- [ ] Clicking opens quick-switch dropdown with recent connections
- [ ] Dropdown shows online hivemind peers when available
- [ ] Selecting an entry switches server connection
- [ ] Falls back to hostname when no instance name configured
- [ ] Tooltip shows full URL, role, and status