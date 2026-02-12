# PRD: Agent Metrics & Forecasting

## Situation
Automaker runs AI agents that implement features, but has almost no persistent metrics. Features have costUsd (cumulative) and startedAt, but no createdAt, completedAt, status transition history, per-execution records, token counts, or PR lifecycle timestamps. All timing data is in-memory and lost on restart.

## Problem
Cannot measure how long features take end-to-end (no createdAt or completedAt). Cannot break down time by phase (queue time, agent time, PR review time, merge time). Cannot track token usage per execution (only cumulative costUsd). Cannot forecast project duration or cost from historical data. Cannot model capacity (features/hour, cost/hour, utilization). Status transitions are not logged — can't identify bottlenecks.

## Approach
Layer 1: Add lifecycle timestamps and status history to Feature type. Layer 2: Capture per-execution records (timing, tokens, cost, model) following RalphIteration pattern. Layer 3: Build MetricsService for aggregation (throughput, cycle time, success rate). Layer 4: Add capacity snapshots and forecasting. All data persists in feature.json — no separate database needed.

## Results
Every feature has full lifecycle timestamps (created, started, reviewed, completed). Every agent execution is recorded with duration, cost, tokens, model. Status transitions are logged for bottleneck analysis. Metrics API provides throughput, cycle time, cost rates, capacity utilization. Project forecasting estimates duration and cost based on historical complexity data.

## Constraints
Backward compatible — existing features without new fields must still load,No external database — persist in feature.json and JSONL files,Don't break FeatureLoader performance — new fields are lightweight,Follow the RalphIteration pattern for execution records (proven approach),Token counts from Claude SDK must be captured alongside costUsd,Capacity snapshots must not impact server performance
