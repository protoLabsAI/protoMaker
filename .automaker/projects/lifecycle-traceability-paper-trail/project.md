# Project: Lifecycle Traceability & Paper Trail

## Goal
Create a fully connected, auditable lifecycle system where every project, feature, ceremony, and agent execution produces a permanent, traceable paper trail. Fix the broken milestone cascade, introduce event persistence, prevent archival data loss, and establish TDD coverage for the entire lifecycle pipeline.

## Milestones
1. Test Foundation - Write comprehensive regression tests BEFORE changing any production code. Cover the exact seams that will be modified: CompletionDetectorService cascade, archival behavior, event emission patterns, ledger recording, and feature scaffolding. These tests define the contract — every subsequent milestone must pass them.
2. Fix Milestone Cascade - Fix the P0 bug: set milestoneSlug and phaseSlug on features during project scaffolding, then verify the CompletionDetectorService cascade works end-to-end. This unblocks automatic milestone completion, project completion, and ceremony triggers.
3. Event Persistence Layer - Introduce an append-only event ledger that captures all lifecycle events with correlation IDs. This is the foundation for full traceability — every project, feature, ceremony, and pipeline event gets a permanent record.
4. Archival Reform - Replace destructive archival with preservation. Feature data moves to .automaker/archive/ instead of being deleted. The paper trail survives indefinitely with configurable retention.
5. Expanded Ledger & Failure Persistence - Extend the metrics ledger to record ALL terminal feature states (not just completed), persist failure classifications on features, and store all Langfuse trace IDs for full retry traceability.
6. Automatic Status Events - Make featureLoader.update() automatically emit feature:status-changed when status changes, eliminating inconsistent manual emission across callers. This ensures all downstream listeners (CompletionDetector, LedgerService, AgentScoringService, EventLedger) fire reliably.
7. Traceability Enrichment - Final enrichment: persist LE session rule logs, restore PR tracking state on restart, and ensure full bidirectional tracing from any artifact back to its source.
