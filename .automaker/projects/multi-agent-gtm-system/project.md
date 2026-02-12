# Project: Multi-Agent GTM System

## Goal
Build a role-based multi-agent system starting with a GTM Coordinator agent. Agents are routable from Discord, UI, and Linear. Each agent has role-specific tools, prompts, and permissions. The GTM agent manages content strategy, marketing, competitor research, and Josh's personal brand. The system establishes the pattern for all future agent teammates.

## Milestones
1. Foundation: Linear MCP + GTM Role - Add Linear MCP to plugin, create GTM specialist role in type system, add GTM prompt template, wire LINEAR_API_KEY into setuplab pipeline.
2. GTM Agent: Discord + Routing - Build the GTM agent as a routable agent accessible from Discord. Upgrade AgentDiscordRouter to use role-specific prompts and tools. Add channel-based routing.
3. Agent Runner UI: Role Selector + Ava Activation - Upgrade the Agent Runner UI panel to support role selection, tool configuration, and direct Ava activation. Make it the control surface for testing and running any agent.
4. Linear Agent Integration - Integrate with Linear's Agent API so agents can be summoned via mentions and delegations in Linear tickets. Build the webhook handler and agent session manager.
5. Polish + Setuplab Integration - Integrate everything into the setuplab pipeline, add MCP tools for agent management, and verify end-to-end flows.
