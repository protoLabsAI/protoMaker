# Phase 1: Add dev:headless script

*Local Build Targets > Root npm Scripts*

Add a root-level dev:headless npm script that builds @protolabsai/types (and other needed packages), then starts the server in production/headless mode. Mirror staging: NODE_ENV=production, no tsx watch, compiled JS. The server package already has start:headless — the root script should build packages first then invoke it.

**Complexity:** small

## Files to Modify

- package.json
- apps/server/package.json

## Acceptance Criteria

- [ ] npm run dev:headless from repo root builds packages and starts the server
- [ ] Server starts in production mode (NODE_ENV=production)
- [ ] No tsx watch — runs compiled JS
- [ ] Port defaults to 3008