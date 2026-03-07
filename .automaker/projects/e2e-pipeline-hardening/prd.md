# PRD: E2E Pipeline Hardening

## Situation
protoLabs Studio has a fully implemented idea-to-production pipeline: signal intake → PM triage → feature planning → auto-mode execution → completion cascade → ceremonies → staging promotion → main (HITL). The pipeline has been battle-tested across 103 shipped features and 14 completed projects.

## Problem
Three gaps remain that create reliability risks: (1) CompletionDetectorService uses in-memory Sets to deduplicate epic/milestone/project completion events — server restart clears these Sets, causing the completion cascade to re-fire and triggering duplicate ceremonies. (2) CeremonyService uses an in-memory processedProjects Set to prevent double-retros — same problem, restart clears it. (3) The promotion-check.yml CI workflow enforces staging→main only; there is no enforcement that PRs targeting staging originate from dev or promote/* branches.

## Approach
Milestone 1: Persist CompletionDetector dedup state to disk (JSONL sidecar) and reload on startup. Milestone 2: Persist CeremonyService.processedProjects to disk and reload on startup. Milestone 3: Add a GitHub Actions workflow (promotion-check-staging.yml) that rejects PRs targeting staging unless they originate from dev or a promote/* branch.

## Results
Server restarts no longer cause double-ceremonies or double-completion cascades. Staging branch is protected from arbitrary PRs. The full e2e pipeline is durable and safe under production operational conditions.

## Constraints
No changes to existing JSONL file formats for EventLedger or LedgerService,Persistence must be append-only JSONL with startup reload consistent with existing patterns,CI workflow must allow promote/* branches used by StagingPromotionService and dev,No breaking changes to existing service interfaces
