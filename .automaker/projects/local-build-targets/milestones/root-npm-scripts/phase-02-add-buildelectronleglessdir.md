# Phase 2: Add build:electron:legless:dir script

*Local Build Targets > Root npm Scripts*

Add a root-level build:electron:legless:dir script that produces an unpacked legless Electron build in a directory (not a distributable). apps/ui already has build:electron:legless — add a :dir variant passing --dir to electron-builder so it outputs an unpacked app directory for local testing without full packaging overhead.

**Complexity:** small

## Files to Modify

- package.json
- apps/ui/package.json

## Acceptance Criteria

- [ ] npm run build:electron:legless:dir from repo root completes successfully
- [ ] Produces an unpacked app directory (not a .dmg/.zip/.exe distributable)
- [ ] Uses the existing legless electron-builder config (no bundled server)
- [ ] Output location is deterministic (e.g. apps/ui/dist-electron/)