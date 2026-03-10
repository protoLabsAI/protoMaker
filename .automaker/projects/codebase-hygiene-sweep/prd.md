# PRD: Codebase Hygiene Sweep

## Situation
A comprehensive codebase audit revealed ~2,500+ lines of dead code, 22+ duplicated utility functions, 25 TypeScript-suppressed UI files, 8+ stub/placeholder methods, and multiple dead event emissions. The codebase has evolved through several architecture generations (PRDService, LangGraph planning flow, auto-mode lead-engineer internals) without the older layers being cleaned up.

## Problem
Dead code paths create confusion for both human and AI developers. Duplicated utilities (formatDuration x12, PATH setup x5, extractTitleFromDescription x3) mean bug fixes must be applied in multiple places. 25 UI files with @ts-nocheck disable TypeScript checking. Stub methods return misleading success values without doing anything. Per-request TrustTierService instantiation creates potential race conditions. A latent bug writes invalid complexity value 'moderate'.

## Approach
Four-milestone sequential cleanup: (1) Safe deletions of confirmed dead systems, (2) Utility consolidation extracting shared functions, (3) Type safety restoration removing @ts-nocheck, (4) Stub and event cleanup. Each phase touches distinct files for parallel agent execution. All independently verifiable via typecheck + tests.

## Results
~2,500+ lines of dead code removed. 22+ duplicated utilities consolidated. TypeScript checking restored across 25 UI files. All stubs resolved. Zero regressions verified by typecheck and full test suite.

## Constraints
Every phase must pass npm run typecheck and npm run test:all independently. No behavioral changes to production code paths. Each phase touches distinct files to avoid merge conflicts. Shared package changes require npm run build:packages before downstream verification.
