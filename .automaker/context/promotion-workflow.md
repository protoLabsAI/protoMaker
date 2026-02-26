# Promotion Workflow

This document explains the promotion pipeline that moves features from development through to production.

## Branch Flow

```
feature/* → dev → staging → main
```

**Agents always target `dev`.** Never open PRs to `staging` or `main`. The promotion pipeline handles those transitions — it is Ava's responsibility, not individual feature agents'.

## Two-Stage Gate

### Stage 1: dev → staging (Ava-autonomous)

- Ava reviews candidates from `.automaker/promotions/candidates.json`
- Selects a curated batch (not all merged features — quality is curated)
- Calls `create_promotion_batch` then `promote_to_staging`
- The system cherry-picks commits, creates a promotion branch, opens a staging PR, and **enables auto-merge**
- Ava owns this gate completely — no human approval needed

### Stage 2: staging → main (HITL-gated)

- Ava calls `promote_to_main`, which creates a staging→main PR and fires a HITL form
- **Ava stops here.** The PR is never auto-merged. Ava never merges it herself.
- A human reviews and approves (or rejects) via the HITL form or directly on GitHub
- This gate exists to maintain production stability — AI owns staging, humans own main

## What Happens to Skipped Candidates

Features not selected for a batch remain as `status=candidate` in the queue. They are eligible for future batches. Ava may also mark candidates `status=held` (cherry-pick conflict prevented inclusion) or `status=rejected` (manually excluded).

## Candidate Readiness Criteria

Before including a candidate in a batch, verify:

1. CI is passing on the feature's dev merge commit
2. No open CodeRabbit review threads on the feature's PR
3. Feature is marked `done` on the Automaker board
4. No `status=held` or `status=rejected` from a previous batch attempt

## Tooling

| MCP Tool | Purpose |
|----------|---------|
| `list_staging_candidates` | View candidates with optional status filter |
| `list_promotion_batches` | View all in-memory batches and their PR status |
| `create_promotion_batch` | Create a batch from selected candidateIds |
| `promote_to_staging` | Ava-autonomous: cherry-pick → staging PR → auto-merge |
| `promote_to_main` | HITL-gated: staging→main PR + HITL form — then stop |
