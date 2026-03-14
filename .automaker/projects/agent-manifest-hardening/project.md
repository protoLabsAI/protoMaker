# Agent Manifest Hardening

Address remaining gaps from the agent manifest audit: type safety, API correctness, lifecycle management, Linux compatibility, testing, and documentation accuracy.

**Status:** active
**Created:** 2026-03-13T22:43:34.040Z
**Updated:** 2026-03-14T00:16:17.977Z

## PRD

### Situation

The Project-Level Agent Extensions system shipped in v0.53.0 with 12 features covering types, manifest service, execution wiring, and settings UI. A post-ship audit identified 2 critical issues (fixed directly) and 9 remaining gaps across type safety, API correctness, lifecycle, platform compatibility, testing, and docs.

### Problem

Several issues reduce reliability and correctness: (1) /api/agents/get returns null capabilities for built-in roles, (2) AgentManifestService not disposed on shutdown leaks fs.watch handles, (3) pipeline execution path has no auto-assignment, (4) _builtIn flag is untyped, (5) confidence score hardcoded to 1.0, (6) manifestPaths setting declared but never consumed, (7) fs.watch recursive:true is a no-op on Linux, (8) no route or integration tests, (9) docs have inaccuracies.

### Approach

Three milestones: (1) Fix API correctness and lifecycle issues, (2) Improve type safety and scoring, (3) Add tests and fix docs. Each phase is independently testable and touches distinct files.

### Results

All audit items resolved. Built-in role capabilities returned correctly. Service properly disposed on shutdown. Pipeline path has auto-assignment. Types are sound. Confidence reflects actual match score. Linux-compatible file watching. Route tests exist. Docs match implementation.

### Constraints

No breaking API changes,Existing tests must continue to pass,Changes must be backward-compatible with existing .automaker/agents.yml files

## Milestones

### 1. API and Lifecycle Fixes

Fix runtime correctness issues in the API and service lifecycle

**Status:** pending

#### Phases

1. **Fix built-in role capabilities in /api/agents/get** (small)
2. **Dispose AgentManifestService on shutdown** (small)
3. **Add auto-assignment to pipeline execution path** (medium)

### 2. Type Safety and Scoring

Improve type soundness and make confidence scores meaningful

**Status:** pending

#### Phases

1. **Type the _builtIn flag on ProjectAgent** (small)
2. **Calculate confidence from match score** (small)
3. **Remove or implement manifestPaths setting** (small)

### 3. Testing and Documentation

Add missing tests and fix documentation inaccuracies

**Status:** completed

#### Phases

1. **Add route tests for /api/agents endpoints** (medium)
2. **Add Linux-compatible file watching** (medium)
3. **Fix documentation inaccuracies** (small)
