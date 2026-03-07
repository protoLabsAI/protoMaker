# SetupLab: Published Onboarding Tool

Refine the existing setuplab pipeline into a polished, published onboarding tool that any developer can run against their repo to get set up with protoLabs Studio. Generates proto.config.yaml, initializes .automaker/, creates tutorial content, and produces an HTML report — all from pure heuristics, no API key required.

**Status:** active
**Created:** 2026-03-07T11:04:42.297Z
**Updated:** 2026-03-07T13:01:26.351Z

## PRD

### Situation

SetupLab exists as a fully implemented 7-phase pipeline with repo research (heuristic stack detection), gap analysis, alignment proposals, HTML report generation, and .automaker/ initialization. Six MCP tools are registered (research_repo, analyze_gaps, propose_alignment, setup_lab, run_full_setup, clone_repo). Services total ~2,300 lines across repo-research-service.ts, gap-analysis-service.ts, alignment-proposal-service.ts, report-generator-service.ts, and labs-service.ts. Types are defined in libs/types/src/setup.ts (247 lines). The skill definition orchestrates the full flow via /setuplab.

### Problem

The current implementation is designed for internal use through the Claude Code plugin — it requires a running automaker server and MCP connectivity. There is no standalone entry point for new users. The initialization creates .automaker/context/ files but does not generate proto.config.yaml (the canonical project config that the CRDT sync project will read). There is no tutorial/walkthrough content to orient new users. The gap analysis creates board features from detected gaps, but new users need guided tutorial content, not an auto-generated backlog. The tool does not create a Getting Started experience that walks users through each product domain.

### Approach

Restructure setuplab into a publishable onboarding tool with three layers: (1) Standalone CLI package that runs repo research and generates proto.config.yaml + .automaker/ structure without requiring a server — pure Node.js, no API key. (2) Enhanced initialization that creates tutorial-oriented content: a Getting Started notes tab with domain walkthroughs (board, agents, context, auto-mode, projects), a spec.md skeleton filled from research, and stack-aware coding-rules.md. (3) Refined HTML report as the 'aha moment' — opens in browser showing what was detected and how to proceed. The proto.config.yaml file becomes the single root-level artifact, compatible with the distributed CRDT sync project's config loader (proto.config -> .automaker/settings.json -> env var layering).

### Results

A developer can run a single command against any repo and get: proto.config.yaml at the root with detected stack/commands/git config, .automaker/ directory with context, memory, features, and spec.md, a Getting Started notes tab with tutorial copy for each product domain, and an HTML report showing their repo's alignment score. No CLAUDE.md is touched. No features are auto-created from gaps. The experience is a guided hello-world tour, not an automated backlog dump.

### Constraints

Must not modify or create CLAUDE.md — that is the user's territory,proto.config.yaml schema must be forward-compatible with the distributed CRDT sync project's proto.config loader (libs/platform/src/proto-config.ts),Repo research must remain pure heuristics — no AI calls, no API key required for the CLI path,Must not break existing /setuplab skill flow — enhance, don't replace,HTML report must be self-contained (single file, no external deps except CDN CSS),Tutorial content must cover all product domains: board, agents, context, auto-mode, projects, git workflow,Single tutorial feature on the board is acceptable but no gap-based feature creation

## Milestones

### 1. proto.config.yaml Schema & Loader

Define the proto.config.yaml schema, create the loader in libs/platform, and wire it into the setup pipeline. This is the foundation — the CRDT sync project depends on this schema.

**Status:** completed

#### Phases

1. **ProtoConfig types and YAML schema** (small)
2. **Config loader with layered resolution** (medium)
3. **Wire config generation into setup_lab** (medium)

### 2. Tutorial Content & Getting Started

Create the guided onboarding experience. Tutorial content for each product domain, notes tab template, spec.md skeleton, and refined coding-rules.md generation.

**Status:** pending

#### Phases

1. **Getting Started notes tab template** (medium)
2. **Spec.md skeleton from research** (small)
3. **Refined coding-rules.md generation** (small)

### 3. CLI Package & Polish

Create a standalone CLI that runs the setup pipeline without requiring a running server. Polish the HTML report and end-to-end flow.

**Status:** pending

#### Phases

1. **Standalone setup CLI package** (large)
2. **HTML report refinements** (medium)
3. **Update /setuplab skill and docs** (small)
