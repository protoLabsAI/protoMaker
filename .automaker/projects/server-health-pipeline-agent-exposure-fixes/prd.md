# PRD: Server Health Pipeline & Agent Exposure Fixes

## Situation
Automaker has extensive health monitoring and Discord notification infrastructure already built — HealthMonitorService runs every 30s detecting stuck features, memory issues, and corrupted features; AvaGatewayService has handlers for health:issue-detected events with severity-emoji formatting and Discord posting; EventHookService supports 13 trigger types; the briefing system classifies events by severity. Additionally, Discord slash commands and thread routing for agents were shipped in PR #271, and most of the extensible agent exposure plan (Phases 3-8) is complete.

## Problem
Three critical breaks prevent the health pipeline from working end-to-end: (1) health:issue-detected event is NEVER emitted by HealthMonitorService despite being defined in event.ts and subscribed to by AvaGatewayService, (2) AvaGatewayService is injected with the STUB DiscordService (every method throws 'not yet implemented') instead of the working DiscordBotService, (3) avaGatewayService.start() is never called in index.ts. Additionally, the Discord agent thread routing has a payload mismatch — discord-bot-service emits {agentId, messages[]} but agent-discord-router expects {routedToAgent, content}, causing undefined values and broken thread conversations. The notification system is in-app only with no real-time Discord posting.

## Approach
Four milestones: (1) Fix the three health pipeline breaks by emitting health:issue-detected, replacing stub DiscordService with DiscordBotService in AvaGateway and EventHookService, and calling start(). (2) Fix the Discord thread routing payload mismatch and add missing role prompts. (3) Add health_check_critical event hook trigger and real-time Discord notifications. (4) Add automatic Frank DevOps triage on critical health events.

## Results
Critical server health events (OOM, stuck agents, crashes) automatically post to Discord #infra channel in real-time. Frank DevOps agent automatically triages critical alerts. Discord slash command threads work correctly for all agent types. AvaGateway heartbeat monitoring is fully operational. Users can configure custom hooks for health events.

## Constraints
NEVER restart the dev server from agents,Keep PRs under 200 lines each,Run npm run build:packages after any libs/ changes,Use DiscordBotService.sendToChannel() for all Discord posting — never the stub DiscordService,Test that health events don't spam Discord (circuit breaker must work),Maintain backward compatibility with existing EventHookTrigger settings
