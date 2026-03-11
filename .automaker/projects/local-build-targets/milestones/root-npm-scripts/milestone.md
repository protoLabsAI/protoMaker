# Root npm Scripts

*Part of: Local Build Targets*

Add the three new commands to the root package.json, per-package package.json files, and document them in CLAUDE.md.

**Status:** planned

## Phases

### 1. Add dev:headless script

Add a root-level dev:headless npm script that builds @protolabsai/types (and other needed packages), then starts the server in production/headless mode. Mirror staging: NODE_ENV=production, no tsx watch, compiled JS. The server package already has start:headless — the root script should build packages first then invoke it.

**Complexity:** small

**Files:**
- package.json
- apps/server/package.json

**Acceptance Criteria:**
- [ ] npm run dev:headless from repo root builds packages and starts the server
- [ ] Server starts in production mode (NODE_ENV=production)
- [ ] No tsx watch — runs compiled JS
- [ ] Port defaults to 3008

### 2. Add build:electron:legless:dir script

Add a root-level build:electron:legless:dir script that produces an unpacked legless Electron build in a directory (not a distributable). apps/ui already has build:electron:legless — add a :dir variant passing --dir to electron-builder so it outputs an unpacked app directory for local testing without full packaging overhead.

**Complexity:** small

**Files:**
- package.json
- apps/ui/package.json

**Acceptance Criteria:**
- [ ] npm run build:electron:legless:dir from repo root completes successfully
- [ ] Produces an unpacked app directory (not a .dmg/.zip/.exe distributable)
- [ ] Uses the existing legless electron-builder config (no bundled server)
- [ ] Output location is deterministic (e.g. apps/ui/dist-electron/)

### 3. Add preview:web script and update docs

Add a root-level preview:web script that runs the full production web build then starts vite preview on port 4173. Also update CLAUDE.md Common Commands section to document all three new commands.

**Complexity:** small

**Files:**
- package.json
- apps/ui/package.json
- CLAUDE.md

**Acceptance Criteria:**
- [ ] npm run preview:web from repo root builds the web app and starts vite preview
- [ ] Runs on port 4173 — documented in CLAUDE.md
- [ ] PWA service worker is included in the build output
- [ ] CLAUDE.md Common Commands section lists all three new commands with descriptions
