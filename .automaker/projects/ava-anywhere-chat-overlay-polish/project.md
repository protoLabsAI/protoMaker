# Ava Anywhere Chat Overlay Polish

Bring the Ask Ava / Ava Anywhere chat overlay to production quality across four areas: message regeneration UI, tool approval visual feedback, protocol message filtering UX, and dispatchResponse wiring.

**Status:** completed
**Created:** 2026-03-09T15:47:21.685Z
**Updated:** 2026-03-10T00:47:56.503Z

## PRD

### Situation

The Ask Ava chat overlay (Cmd+K) and Ava Channel (#backchannel) are structurally complete. Branch tracking, tool approval hooks, protocol filtering, and the reactive spawner all exist in the codebase. However, several surfaces lack the UI polish or final wiring to be production-ready.

### Problem

Four specific gaps block production quality: (1) Message regeneration logic exists but there is no UI — no regenerate button, no prev/next branch navigation, no '1 of N' indicator. (2) Tool approval events fire and handlers exist, but the chat UI shows no cards for pending approvals — users cannot approve or deny tool calls. (3) The Ava Channel filter bar is a single text search and a binary protocol toggle with no category granularity. (4) dispatchResponse in the reactor may not be fully wired to ReactiveSpawnerService in the service container.

### Approach

Milestone 1 adds the regeneration button and branch navigation UI to chat messages. Milestone 2 renders pending tool approval cards inline in the chat. Milestone 3 adds category-based filter chips to the Ava Channel tab. Milestone 4 audits and completes the ReactiveSpawnerService wiring into the service container and verifies dispatchResponse calls it correctly for request-type messages.

### Results

Users can regenerate Ava responses and navigate between variants. Pending tool approvals surface as interactive cards. The #backchannel tab supports per-category protocol filtering. Backchannel messages classified as 'request' trigger real Claude sessions via the reactive spawner with circuit breaker protection.

### Constraints

Thumbs up/down feedback stays as no-op — out of scope,Browser extension ignored — out of scope,Branch tracking state (branchMap, currentBranchIndex, pendingBranchFor) already exists in chat-overlay-content.tsx — do not rewrite, only add UI on top,Tool approval plumbing already exists (use-chat-session.ts pendingSubagentApprovals, approveSubagentTool, denySubagentTool) — only add rendering,No new CRDT document types — protocol category filtering is client-side only,ReactiveSpawnerService circuit breaker config (3 failures, 5min cooldown, 3 sessions/hour) must not be changed

## Milestones

### 1. Message Regeneration UI

Add regenerate button and branch navigation to chat messages. Branch tracking logic already exists — this milestone only adds the UI layer on top of it.

**Status:** completed

#### Phases

1. **Regenerate Button and Branch Navigator** (medium)

### 2. Tool Approval Visual Cards

Render pending tool approval requests as interactive cards in the Ask Ava chat. The approval plumbing already exists in use-chat-session.ts — this milestone adds the UI to surface it.

**Status:** completed

#### Phases

1. **Pending Tool Approval Cards** (small)

### 3. Protocol Filtering UX

Improve the Ava Channel (#backchannel) filter bar with category-based filter chips. Protocol messages self-identify via bracket prefixes — use these to categorize client-side without schema changes.

**Status:** completed

#### Phases

1. **Category Filter Chips for Protocol Messages** (small)

### 4. dispatchResponse Wiring Audit

Audit whether ReactiveSpawnerService is fully wired into the service container and passed to AvaChannelReactorService. Fix any gaps so dispatchResponse correctly spawns Claude sessions for request-type backchannel messages.

**Status:** completed

#### Phases

1. **Wire ReactiveSpawnerService into Service Container** (medium)
