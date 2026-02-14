# Interface Extraction for Hivemind

## Goal

Extract clean, pluggable interfaces from FeatureLoader, EventEmitter, and core types so they can be swapped for distributed implementations in hiveMind Phase 1+. Zero runtime behavior change.

## Milestones

1. **Core Type Definitions** — New interfaces and types in `@automaker/types`
2. **Implementation Conformance** — FeatureLoader and EventEmitter implement new interfaces
3. **Validation and Docs** — Contract tests and architecture documentation
