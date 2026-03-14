# PRD: Agent Manifest Hardening

## Situation
The Project-Level Agent Extensions system shipped in v0.53.0 with 12 features covering types, manifest service, execution wiring, and settings UI. A post-ship audit identified 2 critical issues (fixed directly) and 9 remaining gaps across type safety, API correctness, lifecycle, platform compatibility, testing, and docs.

## Problem
Several issues reduce reliability and correctness: (1) /api/agents/get returns null capabilities for built-in roles, (2) AgentManifestService not disposed on shutdown leaks fs.watch handles, (3) pipeline execution path has no auto-assignment, (4) _builtIn flag is untyped, (5) confidence score hardcoded to 1.0, (6) manifestPaths setting declared but never consumed, (7) fs.watch recursive:true is a no-op on Linux, (8) no route or integration tests, (9) docs have inaccuracies.

## Approach
Three milestones: (1) Fix API correctness and lifecycle issues, (2) Improve type safety and scoring, (3) Add tests and fix docs. Each phase is independently testable and touches distinct files.

## Results
All audit items resolved. Built-in role capabilities returned correctly. Service properly disposed on shutdown. Pipeline path has auto-assignment. Types are sound. Confidence reflects actual match score. Linux-compatible file watching. Route tests exist. Docs match implementation.

## Constraints
No breaking API changes,Existing tests must continue to pass,Changes must be backward-compatible with existing .automaker/agents.yml files
