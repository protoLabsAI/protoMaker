# Project: Antagonistic Review Pipeline

## Goal
Replace blocking HITL gates with autonomous LLM-powered antagonistic review passes. Build a reusable critique-revise loop pattern that scores content against multi-dimension rubrics (G-Eval style chain-of-thought), auto-resolves below a retry threshold, and optionally allows human override. Fix content pipeline output quality issues (HTML entity escaping, duplicate headings, repetitive sections). Document the pattern comprehensively for reuse across the app.

## Milestones
1. Foundation: Antagonistic Review Primitive - Build the core reusable AntagonisticReviewer subgraph and fix XML parser issues
2. Integration: Wire Review Workers to LLM - Replace heuristic stub review workers with real LLM-powered reviewers using existing prompts
3. Pipeline: Replace HITL with Antagonistic Review - Swap out the 3 HITL interrupt gates with antagonistic review passes and update the flow
4. Documentation: Antagonistic Review Pattern - Document the antagonistic review pattern for reuse across the app
