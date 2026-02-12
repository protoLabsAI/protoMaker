# PRD: Discord Agent Router

## Situation
Ava currently polls Discord channels on a schedule to check for messages from Josh. This is wasteful (burns API calls checking empty channels), slow (5-min polling interval), and requires explicit channel configuration. Meanwhile, the DiscordBotService already has a live discord.js Client with GuildMessages + MessageContent intents, but drops all messages that aren't !idea commands or thread replies. The architecture for real-time message handling exists but isn't wired up for agent routing.

## Problem
1) Ava must manually poll specific channels for Josh's messages — slow, wasteful, and fragile. 2) No way for Josh to DM Ava directly for emergencies or quick brainstorming. 3) No pattern exists for routing Discord users to different AI agents (needed for GTM agent for Abdellah). 4) Context is lost — when a user messages, the agent doesn't see recent conversation history, shared files, or images. 5) The monitoring checklist has Discord polling baked in, adding latency to every activation.

## Approach
Extend DiscordBotService.handleMessage() to route non-command messages from mapped users to their assigned AI agent. Add configurable user-to-agent mapping in project settings. Build context gathering (recent channel messages, attachments, images) to give agents full conversational awareness. Add DM capability so agents can directly message their assigned humans. Remove Discord polling from Ava's monitoring checklist since it becomes event-driven. Establish this as the reusable pattern for all future agent teammates.

## Results
1) Real-time Discord message routing — agents respond to their humans within seconds, not minutes. 2) DM channel for emergency/direct communication. 3) Full context awareness — agents see recent messages, files, images when responding. 4) Reusable user-to-agent routing pattern for future agents (GTM, PM, EM). 5) Reduced Ava prompt complexity — no more Discord polling in monitoring checklist.

## Constraints
Build on existing DiscordBotService — don't create a new Discord client,User-to-agent mapping must be configurable (not hardcoded),Must handle rate limiting — Discord limits apply to bot responses,Must ignore bot messages and unmapped users,DM messages must not leak into server channels,Agents should respond in the same channel/thread where the user messaged,Must handle attachments (images, files) and pass them to agents as context,Don't break existing !idea and slash command functionality,Two Discord clients (server + MCP plugin) share one bot token — ensure no duplicate handling
