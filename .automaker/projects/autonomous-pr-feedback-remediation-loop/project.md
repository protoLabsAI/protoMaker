# Project: Autonomous PR Feedback Remediation Loop

## Goal
Build a fully autonomous system that detects PR feedback (human + CodeRabbit), routes it to the original agent with context, has the agent critically evaluate each item (fix or deny with reason), auto-resolves threads, handles CI failures, and creates an auditable paper trail — all without manual intervention.

## Milestones
1. Foundation: Types, Events, Persistence - Extend type system to support per-thread tracking, new events, new feature statuses, and persistent PR tracking state
2. Webhook & Detection - Add instant PR review detection via webhooks with polling fallback
3. Persistence & State Recovery - Persist PR tracking state to disk and restore on server restart
4. Feedback Triage & Agent Context - Parse feedback into per-thread items, load agent's previous context, and prepare structured remediation prompt
5. Antagonistic Review & Thread Resolution - Agent evaluates each feedback item critically, implements fixes, and auto-resolves/denies threads with reasoning
6. CI Failure Loop - Detect CI failures after agent pushes fixes and trigger another remediation cycle
7. Deconflict EM Agent & Cleanup - Remove duplicate pr:changes-requested handler from EM agent and clean up race conditions
8. Integration & Testing - Wire everything together, add logging, handle edge cases, and validate end-to-end flow
