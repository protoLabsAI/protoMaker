---
name: deep-research
description: Codex-native codebase research workflow for protoLabs Studio. Use before planning or implementing a feature when you need to map existing patterns, constraints, related files, and integration points.
---

# Deep Research

This skill is the Codex-native replacement for the Claude `deep-research` workflow.

## Use This Skill When

- the user asks to research a codebase area before implementation
- the user wants to understand how something currently works
- the user wants existing patterns, constraints, or integration points surfaced
- a future plan or PRD needs evidence from the current codebase

## Do Not Use This Skill When

- the task is just a small direct code change
- the user wants immediate implementation rather than research
- the question can be answered from one obvious file without broader exploration

## Objective

Produce a structured research summary that explains:

- relevant files
- current patterns
- integration points
- constraints and gotchas
- recommended starting points

## Workflow

1. Clarify the research target if needed.
2. Read project-level context:
   - `README.md`
   - relevant docs
   - project spec or context files if MCP access is available
3. Explore the codebase for relevant files, types, tests, configs, and prior features.
4. Identify repeated patterns and conventions.
5. Summarize findings in a way that can feed planning or implementation.

## What To Look For

- similar implementations
- service and route boundaries
- UI composition patterns
- model, store, and API contracts
- test patterns
- config and environment assumptions
- known constraints and failure modes

## Output Structure

- summary
- relevant files
- current patterns
- constraints and gotchas
- integration points
- recommended approach
- open questions

## Notes

- Prefer concrete evidence over abstractions.
- Use MCP context or project metadata when available, but the main work is local codebase inspection.
