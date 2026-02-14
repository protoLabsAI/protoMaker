# PRD: Antagonistic Review Pipeline

## Situation
The content creation pipeline (libs/flows/src/content/) has a working 7-phase flow with 4 Send() parallelism points and 3 HITL interrupt gates. The SectionWriter subgraph generates sections with smart/fast model fallback and XML output parsing. However: (1) HITL gates block the entire flow waiting for human input, (2) review workers are pure heuristic stubs with no LLM calls, (3) output has quality issues (HTML entities in code blocks, duplicate headings, repetitive content), (4) the rich 8-dimension antagonistic scoring rubric in style-reviewer.md is not wired up to code.

## Problem
Three blocking problems: (1) HITL gates prevent autonomous end-to-end execution — every flow run requires human intervention at 3 points, making batch content generation impossible. (2) Review workers are stubs that auto-approve everything — no quality gate catches duplicate headings, repetitive sections, or HTML entity escaping in code blocks. (3) The antagonistic review pattern (Constitutional AI critique-revision, G-Eval scoring, LLM-as-judge) is not captured as a reusable primitive — each new flow would need to reinvent it.

## Approach
Build a reusable AntagonisticReviewer subgraph in @automaker/flows that implements the critique-revise loop pattern. Replace HITL gates with autonomous LLM review passes that score content against configurable dimension rubrics. Use G-Eval style chain-of-thought for consistent scoring. Fix XML parser to unescape HTML entities in code blocks. Add deduplication detection in the assembly phase. Wire existing review prompts (style-reviewer.md, technical-reviewer.md, fact-checker.md) to actual LLM calls in review workers. Document the antagonistic review pattern as a first-class flow primitive in docs.

## Results
Content pipeline runs end-to-end autonomously with quality gates. Generated content scores ≥75% on 8-dimension rubric before proceeding. HTML entity escaping fixed in code blocks. Duplicate headings and repetitive content detected and flagged for regeneration. Reusable AntagonisticReviewer subgraph available for any LangGraph flow. Pattern documented in docs/dev/ for team adoption.

## Constraints
Must not break existing HITL flow — antagonistic review is the default, HITL becomes optional overlay,Max 2 retry loops per gate to prevent infinite loops and runaway API costs,Use existing prompt files (style-reviewer.md, technical-reviewer.md, fact-checker.md) — don't reinvent,XML output format for all LLM responses (our standard pattern),Langfuse tracing on all review LLM calls,Smart model (Sonnet) for antagonistic review, fast model (Haiku) for quick structural checks,No new npm dependencies — use existing @langchain/langgraph, @langchain/anthropic, zod
