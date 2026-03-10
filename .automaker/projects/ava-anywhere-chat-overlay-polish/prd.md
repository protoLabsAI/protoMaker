# PRD: Ava Anywhere Chat Overlay Polish

## Situation

The Ask Ava chat overlay (Cmd+K) and Ava Channel (#backchannel) are structurally complete. Branch tracking, tool approval hooks, protocol filtering, and the reactive spawner all exist in the codebase. However, several surfaces lack the UI polish or final wiring to be production-ready.

## Problem

Four specific gaps block production quality: (1) Message regeneration logic exists but there is no UI — no regenerate button, no prev/next branch navigation, no '1 of N' indicator. (2) Tool approval events fire and handlers exist, but the chat UI shows no cards for pending approvals — users cannot approve or deny tool calls. (3) The Ava Channel filter bar is a single text search and a binary protocol toggle with no category granularity. (4) dispatchResponse in the reactor may not be fully wired to ReactiveSpawnerService in the service container.

## Approach

Milestone 1 adds the regeneration button and branch navigation UI to chat messages. Milestone 2 renders pending tool approval cards inline in the chat. Milestone 3 adds category-based filter chips to the Ava Channel tab. Milestone 4 audits and completes the ReactiveSpawnerService wiring into the service container and verifies dispatchResponse calls it correctly for request-type messages.

## Results

Users can regenerate Ava responses and navigate between variants. Pending tool approvals surface as interactive cards. The #backchannel tab supports per-category protocol filtering. Backchannel messages classified as 'request' trigger real Claude sessions via the reactive spawner with circuit breaker protection.

## Constraints

Thumbs up/down feedback stays as no-op — out of scope,Browser extension ignored — out of scope,Branch tracking state (branchMap, currentBranchIndex, pendingBranchFor) already exists in chat-overlay-content.tsx — do not rewrite, only add UI on top,Tool approval plumbing already exists (use-chat-session.ts pendingSubagentApprovals, approveSubagentTool, denySubagentTool) — only add rendering,No new CRDT document types — protocol category filtering is client-side only,ReactiveSpawnerService circuit breaker config (3 failures, 5min cooldown, 3 sessions/hour) must not be changed
