# Phase 1: Hivemind instance auto-discovery in server picker

*Headless Server + Remote Client Architecture > Hivemind Instance Picker + Build Targets*

When connected to any server, fetch the peer list from /api/health (which already includes onlinePeers with full InstanceIdentity). Display peers in the Server Connection section as clickable cards showing: instance name, role badge, running agents count, capacity bar, online/offline status. Clicking a peer sets its identity.url as the server URL override and connects. Add a refresh button to re-fetch peers. Handle the case where peers don't advertise a URL (show as 'no direct access').

**Complexity:** medium

## Files to Modify

- apps/ui/src/components/views/settings-view/developer/developer-section.tsx
- apps/ui/src/store/app-store.ts

## Acceptance Criteria

- [ ] Online peers displayed with name, role, capacity, status
- [ ] Clicking a peer connects to its URL
- [ ] Peers without URLs shown but not clickable
- [ ] Refresh button fetches updated peer list
- [ ] Works when hivemind is disabled (shows empty state)