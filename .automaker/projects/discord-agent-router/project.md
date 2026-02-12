# Project: Discord Agent Router

## Goal
Event-driven Discord message routing that maps users to AI agents. The bot watches for messages from specific users anywhere in the server, routes them to their assigned agent, and responds in-channel. Replaces Ava's polling-based Discord monitoring with real-time event-driven handling. Includes DM capability for direct agent-human communication and establishes the pattern for all future agent teammates (GTM agent for Abdellah, etc.).

## Milestones
1. Types, Config & User Routing - Foundation layer: event types, settings schema for user-agent mapping, and DM types.
2. Message Router & Context Gathering - Core routing logic in DiscordBotService: intercept messages from mapped users, gather context, route to agents, and reply.
3. DM Channel & Ava Prompt Cleanup - Add DM capability and remove Discord polling from Ava's monitoring checklist.
