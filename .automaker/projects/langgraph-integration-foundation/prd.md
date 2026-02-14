# PRD: LangGraph Integration Foundation

## Situation
Automaker currently uses the Claude Agent SDK for all agent execution with prompts embedded in code and Anthropic as the only LLM provider. The pre-board pipeline (research → PRD → scaffold) is manual or loosely structured via MCP tools. We want to add LangGraph-based deterministic flows with multi-provider support and Langfuse observability, but need to avoid disrupting the existing feature implementation workflow while the team develops this capability.

## Problem
Without proper package isolation, adding LangGraph dependencies and patterns risks breaking existing agents, complicating the codebase, and creating merge conflicts with ongoing feature work. We need a clean foundation that can be developed in parallel and integrated later when proven stable.

## Approach
Create three new standalone packages in libs/: @automaker/llm-providers (multi-provider abstraction), @automaker/observability (Langfuse integration), and @automaker/flows (LangGraph state graphs). Each package will have comprehensive tests, documentation, and example usage. Packages will be developed independently with zero imports from existing Automaker code. Once stable, we can add optional integration points.

## Results
Team can develop LangGraph capabilities in parallel without touching existing agent execution. New packages will be fully tested, documented, and demo-ready. When ready to integrate, existing code can gradually adopt the new capabilities via feature flags. Risk of breaking production workflows is eliminated.

## Constraints
Zero changes to existing apps/server or apps/ui code,Zero changes to existing libs/ packages (types, utils, prompts, etc.),New packages must have 100% test coverage,Must work with current npm workspace structure,Must be optional — existing code continues working without them,All examples run standalone without Automaker server,No Langfuse API key required for tests (mock/fallback patterns)
