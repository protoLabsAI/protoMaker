# Phase 2: Legless Electron build + headless server config

*Headless Server + Remote Client Architecture > Hivemind Instance Picker + Build Targets*

Add npm run build:electron:legless script that builds Electron without the server bundle — skips prepare-server.mjs and removes server extraResources from electron-builder config. The legless build sets SKIP_EMBEDDED_SERVER=true by default and shows the server connection picker on first launch instead of trying to connect to localhost:3008. Add npm run start:headless script that runs the server with NODE_ENV=production, auto-mode enabled, and no UI dependencies. Add a headless example section to proto.config.yaml docs with 2-agent defaults.

**Complexity:** medium
**Dependencies:** hivemind-instance-picker

## Files to Modify

- apps/ui/package.json
- apps/ui/scripts/prepare-server.mjs
- apps/ui/src/main.ts
- apps/server/package.json
- docs/dev/deployment-modes.md

## Acceptance Criteria

- [ ] npm run build:electron:legless produces working Electron app without server
- [ ] Legless Electron shows server picker on first launch
- [ ] npm run start:headless starts server-only with production defaults
- [ ] Existing npm run build:electron still bundles server (no regression)
- [ ] Documentation covers all three deployment modes