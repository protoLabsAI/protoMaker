---
name: due-diligence
description: Codex-native validation workflow for technology choices and architectural approaches. Use when the user wants evidence-based comparison, external validation, tradeoff analysis, or risk assessment before committing to a path.
---

# Due Diligence

This skill is the Codex-native replacement for the Claude `due-diligence` workflow.

## Use This Skill When

- the user wants to compare approaches or technologies
- the user wants architectural validation
- the user wants external evidence before committing
- the user wants risks, tradeoffs, and compatibility assessed

## Do Not Use This Skill When

- the decision is already made and implementation should begin
- the task is purely internal codebase research with no external validation
- the question is trivial and does not justify research

## Objective

Combine codebase context with external research to recommend a path grounded in evidence.

## Workflow

1. Analyze current repo constraints and existing patterns.
2. Identify the decision candidates and evaluation criteria.
3. Research external evidence:
   - primary docs
   - benchmarks
   - production case studies
   - known pitfalls
4. Compare options explicitly.
5. Recommend a path and explain why.

## Evaluation Dimensions

- performance
- scalability
- compatibility with the current codebase
- migration complexity
- maintainability
- operational risk

## Output Structure

- codebase context
- external findings
- option comparison
- recommendation
- caveats
- fallback option

## Notes

- Prefer recent, primary, and directly relevant sources.
- When browsing is required, cite sources clearly.
- Be explicit when evidence is mixed or incomplete.
