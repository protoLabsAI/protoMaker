# Hivemind Instance Picker + Build Targets

*Part of: Headless Server + Remote Client Architecture*

Auto-discover hive instances for the server picker, add legless Electron and web build scripts, and headless server config.

**Status:** undefined
**Dependencies:** server-url-runtime-switching

## Phases

### 1. Hivemind instance auto-discovery in server picker

When connected to any server, fetch the peer list from /api/health (which already includes onlinePeers with full InstanceIdentity). Display peers in the Server Connection section as clickable cards showing: instance name, role badge, running agents count, capacity bar, online/offline status. Clicking a peer sets its identity.url as the server URL override and connects. Add a refresh button to re-fetch peers. Handle the case where peers don't advertise a URL (show as 'no direct access').

**Complexity:** medium

**Files:**
- apps/ui/src/components/views/settings-view/developer/developer-section.tsx
- apps/ui/src/store/app-store.ts

**Acceptance Criteria:**
- [ ] Online peers displayed with name, role, capacity, status
- [ ] Clicking a peer connects to its URL
- [ ] Peers without URLs shown but not clickable
- [ ] Refresh button fetches updated peer list
- [ ] Works when hivemind is disabled (shows empty state)

### 2. Legless Electron build + headless server config

Add npm run build:electron:legless script that builds Electron without the server bundle — skips prepare-server.mjs and removes server extraResources from electron-builder config. The legless build sets SKIP_EMBEDDED_SERVER=true by default and shows the server connection picker on first launch instead of trying to connect to localhost:3008. Add npm run start:headless script that runs the server with NODE_ENV=production, auto-mode enabled, and no UI dependencies. Add a headless example section to proto.config.yaml docs with 2-agent defaults.

**Complexity:** medium

**Files:**
- apps/ui/package.json
- apps/ui/scripts/prepare-server.mjs
- apps/ui/src/main.ts
- apps/server/package.json
- docs/dev/deployment-modes.md

**Acceptance Criteria:**
- [ ] npm run build:electron:legless produces working Electron app without server
- [ ] Legless Electron shows server picker on first launch
- [ ] npm run start:headless starts server-only with production defaults
- [ ] Existing npm run build:electron still bundles server (no regression)
- [ ] Documentation covers all three deployment modes
