# Project: Content Creation Pipeline

## Goal
Build a production-ready content creation pipeline using LangGraph state graphs that enables parallel research, writing, review, and multi-format output (blog posts, technical docs, training data, HF datasets). The pipeline leverages @automaker/flows for orchestration, @automaker/llm-providers for model fallback chains, and @automaker/observability for Langfuse tracing. Draws patterns from Proto Starter (subgraph-as-node delegation, HITL phase gates) and MythxEngine (Send() parallel fan-out, two-wave generation, Langfuse+local fallback).

## Milestones
1. Foundation: Content Types and State Definitions - Define the core TypeScript types, Zod schemas, and LangGraph state annotations for the content creation pipeline. This establishes the data contracts that all subsequent phases depend on.
2. Research Subgraph with Parallel Workers - Build the research phase as a subgraph with Send()-based parallel fan-out to specialized research workers. Draws from MythxEngine's wave pattern and Proto Starter's evidence gathering.
3. Planning and Outline Generation - Build the planning phase that takes research findings and generates a structured outline with section decomposition, then gates on HITL approval.
4. Parallel Section Generation via Send() - Build the core generation phase using Send() for true parallel section writing. Each section gets an isolated SectionWriter subgraph with its own research context, model, and Langfuse trace.
5. Assembly and Parallel Review - Merge generated sections into coherent documents, then run parallel review passes for quality assurance.
6. Multi-Format Output Pipeline - Parallel output generation producing markdown files, HuggingFace datasets, and metadata in the formats needed for each use case.
7. Testing and Documentation - Comprehensive test coverage using FakeChatModel and documentation of the content creation pipeline pattern.
