# AI Agent App Starter Kit

Build a monorepo starter kit template that distills protoLabs Studio's AI chat system into a reusable Vite+React 19 SPA + Express backend, shipping streaming chat, tool invocations, HITL confirmation, extended reasoning, slash commands, multi-provider model support, and agent roles — all scaffoldable via create-protolab.

**Status:** active
**Created:** 2026-03-15T06:39:49.665Z
**Updated:** 2026-03-15T10:33:23.926Z

## PRD

### Situation

protoLabs Studio has a production-quality AI chat system across libs/ui/src/ai/ (25 components), server chat routes (AI SDK streaming), model resolver (multi-provider), slash commands, and session state. The scaffold system supports docs, portfolio, landing-page, extension, and general starter kits but has no AI/agent kit.

### Problem

Developers building AI-native apps have no clean starting point. They must wire up Vercel AI SDK streaming from scratch or copy-paste from automaker and manually strip internal code. The Claude Agent SDK is the primary driver but there is no reference implementation showing how to build a complete agent UX.

### Approach

Extract and componentize existing chat UI into a standalone packages/ui library. Build packages/server with Express + Claude Agent SDK streaming, tool registry, slash commands, agent roles, and multi-provider model resolver. Build packages/app as a Vite + React 19 SPA with Zustand persistent sessions and TanStack Router. Ship as libs/templates/starters/ai-agent-app/ integrated into the scaffold system.

### Results

Users run npx create-protolab my-app --kit ai-agent-app and get a working monorepo with streaming chat connected to Claude within 5 minutes. Custom tools render with rich UI cards. HITL works inline. Extended reasoning displays. Sessions persist. Slash commands and agent roles are user-configurable.

### Constraints

React 19 best practices ONLY. Claude Agent SDK is primary driver. npm workspaces only. Inline HITL not dialog. No auth/DB/SaaS. Multi-provider via AI SDK. Must integrate with scaffold system (7 files). All components fully decoupled from @protolabsai packages.

## Milestones

### 6. Tools Package — Define Once, Deploy Everywhere

Extract the defineSharedTool, ToolRegistry, and adapter system (MCP, LangGraph, Express) from libs/tools/ into the starter kit. This is the foundation that all other packages build on.

**Status:** completed

#### Phases

1. **Extract tool definitions, registry, and adapters** (large)
2. **Wire tools package into server chat route** (medium)

### 7. Observability — Langfuse + Built-in Tracing

Extract the Langfuse tracing wrapper from libs/observability/ and add built-in debug tracing for easy agent debugging without requiring external services.

**Status:** completed

#### Phases

1. **Extract Langfuse wrapper and built-in tracing** (large)
2. **Build trace viewer UI route** (medium)

### 8. Flows — LangGraph State Graphs + Visual Builder

Extract LangGraph graph primitives from libs/flows/ and build a visual flow builder using React Flow for designing agent workflows on a canvas.

**Status:** undefined

#### Phases

1. **Extract LangGraph graph primitives** (large)
2. **Build visual flow builder with React Flow** (large)

### 9. Prompts — Git-Versioned Templates + Playground

Extract the PromptBuilder and prompt registry from libs/prompts/ and build a prompt playground for testing and iterating on prompts.

**Status:** completed

#### Phases

1. **Extract prompt builder and registry** (medium)
2. **Build prompt playground UI** (medium)

### 10. MCP Server + Documentation

Add an example MCP server using the tools package adapters, and ship comprehensive docs extracted from automaker plus new content.

**Status:** completed

#### Phases

1. **Create MCP server example** (medium)
2. **Create docs directory with extracted and new content** (large)
3. **Update README with full platform documentation** (medium)
