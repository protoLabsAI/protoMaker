# PRD: Multi-Agent GTM System

## Situation
Automaker has a working single-agent system (Ava as Chief of Staff) with authority agents (PM, ProjM, EM) for engineering. The GTM Strategy Linear project has content strategy, brand voice guidelines, and a first-draft GTM coordinator prompt. Discord routing exists but uses basic simpleQuery with no tools or role-specific context. The Agent Runner UI has a chat interface but no role selection. Linear MCP and Discord MCP are bundled in the plugin. Seven agent roles are defined in types but only engineering roles are connected.

## Problem
There is no non-engineering agent capability. Josh and Abdellah need a GTM agent for content creation, marketing strategy, competitor analysis, and personal brand management. The existing agent infrastructure (roles, prompts, routing) is 80% built but not wired together. Discord routing is dumb (no tools, no role prompts). The Agent Runner UI can't select roles or configure agents. Linear integration exists but agents can't be summoned from Linear tickets. There's no pattern for adding new domain-specific agents.

## Approach
Build in 5 milestones: (1) Linear MCP integration + GTM role foundation, (2) GTM agent with full system prompt and tools, (3) Smart Discord routing with role-aware dispatch, (4) Agent Runner UI upgrade with role selector and Ava activation, (5) Linear Agent API integration for in-ticket summoning. Use the existing ROLE_CAPABILITIES type system, extend AgentDiscordRouter for role-aware routing, and build the GTM prompt from Josh's first draft plus protoLabs philosophy.

## Results
A working GTM Coordinator agent accessible from Discord (#gtm channel), the Agent Runner UI (role selector), and eventually Linear (mentions/delegation). Ava gets Linear access for full strategic visibility. The role-based agent pattern is established so future agents (Designer, QA, DevOps, etc.) can be added by defining a role + prompt + tools. All protoLab environments get Linear + Discord + Automaker MCP out of the box.

## Constraints
Must use existing ROLE_CAPABILITIES type system — extend, don't rebuild,GTM agent sees only GTM Linear project, Ava sees everything,Max 2-3 concurrent agents on dev server (memory constraint),Linear Agent API is Developer Preview — build MCP-first, Agent API second,GTM prompt must incorporate Josh's brand voice guide and protoLabs philosophy,Keep PRs under 200 lines — use Graphite stacking for epic workflows
