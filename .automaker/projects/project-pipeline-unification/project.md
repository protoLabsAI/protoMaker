# Project Pipeline Unification

Unify all feature creation paths to consistently set projectSlug, enabling project timelines, milestone completion detection, and project-scoped queries across all entry points.

**Status:** completed
**Created:** 2026-03-13T22:49:31.382Z
**Updated:** 2026-03-14T02:17:57.017Z

## PRD

### Situation

Features are created through 18+ entry points: REST API, MCP tools, signal intake (Discord/GitHub/Twitch), project orchestration, bug routing, ceremonies, friction tracking, and more. Only 5 of these set the projectSlug field. The remaining 13 create orphan features with no project association. The event ledger, project timeline, completion detector, and project-scoped queries all depend on projectSlug to function.

### Problem

Project timelines show 'No activity yet' for all projects because 97% of features (458/460) lack projectSlug. This breaks: (1) project timeline display, (2) milestone completion detection (guards on projectSlug), (3) project-scoped board queries, (4) event ledger project correlation. The root cause is fragmented feature creation — each entry point independently builds a Feature object, and most skip projectSlug because they only have projectPath, not project context.

### Approach

Three-phase approach: (1) Add a centralized projectSlug resolver that maps projectPath to a default project slug, and wire it into FeatureLoader.create() so ALL creation paths get projectSlug automatically. (2) Backfill existing features with the correct projectSlug. (3) Ensure all event emission paths include projectSlug in their payloads so the event ledger, timeline, and completion detector work correctly.

### Results

All project timelines show real activity. Milestone completion detection fires correctly. Event ledger entries have projectSlug for all feature events. Project-scoped board queries return complete results. New features created through any entry point automatically get projectSlug set.

### Constraints

Must not break existing features or projects,Must handle features that genuinely don't belong to any project (system improvements, ad-hoc),Backfill must be idempotent and safe to re-run,No changes to the Feature type schema beyond what already exists,Must work for single-project installs (automaker) and multi-project installs

## Milestones

### 1. Centralized Project Resolution

Add automatic projectSlug resolution to FeatureLoader.create() so all 18+ entry points get projectSlug without individual changes

**Status:** completed

#### Phases

1. **Add project slug resolver service** (small)
2. **Wire projectSlug auto-assignment into FeatureLoader.create** (medium)
3. **Backfill projectSlug on existing features** (medium)

### 2. Event Pipeline Enrichment

Ensure all event emission paths include projectSlug so the ledger, timeline, and completion detector work correctly

**Status:** completed

#### Phases

1. **Enrich feature events with projectSlug at emission** (medium)
2. **Backfill projectSlug on existing ledger entries** (medium)

### 3. Timeline Reliability

Make the project timeline robust and useful across all project types

**Status:** completed

#### Phases

1. **Add fallback timeline from feature activity** (medium)
2. **Verify completion detector with projectSlug** (medium)
3. **Add project timeline to project detail view** (small)
