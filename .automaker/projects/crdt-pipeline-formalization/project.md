# CRDT Pipeline Formalization

Formalize the instance-local feature model, eliminate dead code from the abandoned feature-sync era, extend CRDT sync to cover notes and categories, and close test coverage gaps — producing a clean, well-documented CRDT architecture where features are definitively local and all shared state syncs via Automerge.

**Status:** active
**Created:** 2026-03-12T16:48:26.033Z
**Updated:** 2026-03-12T17:02:26.111Z

## PRD

### Situation

Automaker uses Automerge 3.2.4 with a two-layer sync mesh (JSON events on port 4444 for cluster coordination, Automerge binary on port 4445 for document replication) over Tailscale VPN. Seven CRDT domains are live: projects, shared settings, capacity, ava-channel, calendar, todos, and metrics. Features are intentionally instance-local — each instance manages its own board and coordinates via phase claims on shared project documents. This architecture is sound and battle-tested over ~300 shipped features.

### Problem

The codebase contains significant dead code from a previous architectural attempt to sync features via CRDT that was correctly abandoned in February 2026 (commit db8801061). Dead methods (applyRemoteChanges, getDocBinary), dead event types (crdt:remote-changes), a dead claim protocol (200ms settle delay with no actual sync), and a vestigial hive: config section all remain. Beyond cleanup, two gaps exist in shared data coverage: (1) Notes tabs are disk-only — multiple instances writing notes simultaneously produce silent last-write-wins data loss. (2) Categories are disk-only — instances diverge on available categories. Additionally, memory file usage stats (loaded/referenced counters) diverge across instances because each writes to its own disk file with no aggregation. Test coverage for partition recovery, registry sync, and compaction is absent.

### Approach

Four milestones in dependency order: (1) Dead code removal — eliminate all remnants of the feature-sync model, rename the misleadingly-named CrdtFeatureEvent type, remove the vestigial hive: config. (2) Lightweight sync extensions — add categories to the event bridge (not a full CRDT domain; it is a 21-byte array), move memory usage stats into the existing Metrics CRDT domain. (3) Notes as CRDT domain — add a NotesWorkspace CRDT domain following the todos pattern (one shared document, LWW per tab), implement hydration from existing workspace.json files, add server-side CRDT read/write to the notes routes with disk fallback. (4) Test coverage and Automerge upgrade — fill the identified test gaps for partition recovery, registry sync, and compaction; upgrade all @automerge packages to latest 3.x to capture the 10x memory improvement. The @automerge/prosemirror TipTap binding for real-time character-level collaboration is deferred as a separate project — the current approach (CRDT-backed JSON API) is sufficient for multi-instance agent sync.

### Results

Clean CRDT codebase with no dead code from the feature-sync era. Instance-local feature model is formally documented and enforced. Notes sync across instances (agents on staging see operator notes from dev). Categories stay consistent across instances. Memory usage stats aggregate across instances via the Metrics domain. All CRDT sync paths have tests for partition recovery and registry sync. Automerge upgraded to latest 3.x with confirmed backwards compat.

### Constraints

Features remain instance-local — this is a design decision, not a gap to fill,Memory file CONTENT stays git-tracked only — no dual-channel sync (git + CRDT would produce guaranteed merge conflicts),Context files stay git-tracked only — same dual-channel reason; they are operator-curated project config,No @automerge/prosemirror TipTap binding in this project — character-level rich text sync is a separate future project,All PR targets dev branch. No direct pushes to staging or main,Notes CRDT uses LWW-per-tab semantics (not character-level merge) — consistent with the existing todos and calendar patterns,proto.config.yaml hive: section removal must update loadProtoConfig() instance ID fallback before removing the type — avoid compile errors,Automerge upgrade must confirm file format backwards compat (guaranteed by Automerge 3.x, but verify in tests),No credentials or API keys ever enter any CRDT domain

## Milestones

### 1. Dead Code Removal

Eliminate all remnants of the abandoned feature-sync model. Remove dead methods, dead event types, dead config sections, and rename misleading type names. No behavior changes — purely subtractive.

**Status:** pending

#### Phases

1. **Remove dead AutomergeFeatureStore methods and claim protocol** (small)
2. **Remove crdt:remote-changes event type and rename CrdtFeatureEvent** (small)
3. **Remove vestigial hive: config section** (small)

### 2. Lightweight Sync Extensions

Two small additions that close real sync gaps without introducing new full CRDT domains: categories via the existing event bridge, and memory usage stats folded into the existing Metrics domain.

**Status:** pending

#### Phases

1. **Categories via event bridge** (small)
2. **Memory usage stats in Metrics CRDT domain** (medium)

### 3. Notes as CRDT Domain

Add a NotesWorkspace CRDT domain following the todos pattern — one shared document per project containing all tabs with LWW-per-tab semantics. Multi-instance agents can read and write notes without last-write-wins data loss. Hydrate from existing workspace.json on first start.

**Status:** pending

#### Phases

1. **Add NotesWorkspace CRDT domain schema** (medium)
2. **Refactor notes routes to use CRDTStore with disk fallback** (medium)
3. **Expose notes CRDT via MCP tools and document the boundary** (small)

### 4. Test Coverage and Automerge Upgrade

Fill identified test gaps for partition recovery, registry sync, and compaction. Upgrade all @automerge packages to latest 3.x for the 10x memory improvement and latest bug fixes.

**Status:** pending

#### Phases

1. **Fill CrdtSyncService test gaps** (medium)
2. **Fill CRDTStore test gaps** (medium)
3. **Upgrade @automerge packages to latest 3.x** (medium)
