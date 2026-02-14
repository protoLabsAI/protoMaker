# PRD: Linear Deep Integration

## Situation
Automaker has bidirectional Linear sync (feature-issue) with webhook handling and OAuth. CopilotKit project has 39 issues in Linear. GitHub PR state is invisible in Linear.

## Problem
User wants to see full work lifecycle across GitHub, Automaker, and Linear from Linear. Currently, Linear issues show In Review/Done but nothing in between.

## Approach
Event-driven tri-directional sync: GitHub PR events to Automaker events to Linear updates. Issue relation sync for dependencies. Automated project status updates via LangGraph flows.

## Results
From Linear, see exact PR state per issue. See dependency graph. Get automated project status reports.

## Constraints
No GitHub webhooks - use gh CLI polling,Linear API rate limit: 1400 req/hr,Follow existing LangGraph patterns,No breaking changes,Keep LangGraph flows cost-efficient
