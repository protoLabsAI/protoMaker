# Phase 3: Add preview:web script and update docs

*Local Build Targets > Root npm Scripts*

Add a root-level preview:web script that runs the full production web build then starts vite preview on port 4173. Also update CLAUDE.md Common Commands section to document all three new commands.

**Complexity:** small

## Files to Modify

- package.json
- apps/ui/package.json
- CLAUDE.md

## Acceptance Criteria

- [ ] npm run preview:web from repo root builds the web app and starts vite preview
- [ ] Runs on port 4173 — documented in CLAUDE.md
- [ ] PWA service worker is included in the build output
- [ ] CLAUDE.md Common Commands section lists all three new commands with descriptions