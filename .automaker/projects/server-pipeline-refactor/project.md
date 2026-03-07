# Project: Server Pipeline Refactor

## Goal
Consolidate the overlapping auto-mode and Lead Engineer control planes into a clean Scheduler + Feature Pipeline architecture, eliminate the broadcast event storm, and make the system ready for Ava chat as the primary operator interface.

## Milestones
undefined. Test Foundation - Establish the regression safety net before touching any production code. Cover the exact seams that will be split: the scheduler loop, the pipeline state transitions, and the IAutoModeCallbacks contract.
undefined. Structured Pipeline Results - Give LE.process() a typed return value so the scheduler can interpret outcomes without relying on catch blocks. Eliminates the class of bugs where ESCALATE returns success to the scheduler.
undefined. Pipeline Owns Its State - Move model selection, status updates, and event emission from auto-mode callbacks into the pipeline processors. The pipeline owns its state machine — the scheduler only provides the feature ID.
undefined. Thin Scheduler Extraction - Extract the remaining scheduling logic from auto-mode-service.ts into a clean FeatureScheduler, then remove the legacy executeFeature fallback path.
undefined. Typed Event Bus - Add filtered typed subscriptions to EventEmitter and migrate hot-path services off broadcast-all. Backwards-compatible — existing subscribe() calls continue to work.
