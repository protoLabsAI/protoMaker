# Project: Agent Architect: Dynamic Role Registry & Factory

## Goal
Enable runtime creation, management, and execution of AI agent roles through a dynamic registry, template system, and factory pattern — replacing static TypeScript union types with a flexible, validated, extensible system.

## Milestones
1. Foundation: Template Schema & Registry - Create the type definitions, Zod schemas, and in-memory registry that form the foundation for dynamic roles. No behavior changes — purely additive.
2. Agent Factory & Execution - Build the factory service that creates agent instances from templates, and the dynamic agent executor that runs them. This enables runtime agent creation.
3. Consumer Migration - Migrate existing code that uses static AgentRole lookups to use the dynamic registry. Switch statements and Record<AgentRole,T> patterns become registry lookups with fallbacks.
4. MCP Tools & API - Expose agent management through MCP tools and REST API endpoints so Ava and other agents can create/manage roles at runtime.
5. Integration & Polish - Wire everything together, add UI support, test end-to-end, and update documentation.
