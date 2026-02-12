# Project: Server Health Pipeline & Agent Exposure Fixes

## Goal
Connect the broken health event pipeline (HealthMonitor → Discord → Frank triage), fix the Discord agent thread routing bug, replace the stub DiscordService with the working DiscordBotService, and add real-time Discord notifications for critical server events.

## Milestones
1. Connect Health Pipeline Plumbing - Fix the three critical breaks that prevent health events from reaching Discord: emit health:issue-detected, replace stub DiscordService, and call avaGatewayService.start().
2. Fix Discord Thread Routing - Fix the event payload mismatch between discord-bot-service.ts and agent-discord-router.ts that breaks slash command thread conversations, and add missing role prompt fallbacks.
3. Health Event Hooks & Real-Time Notifications - Extend the event hook system with health-specific triggers and add real-time Discord posting for critical events (not just 30-minute heartbeat).
4. Frank Auto-Triage on Critical Health Events - When the server detects critical health issues, automatically spawn Frank (DevOps agent) to diagnose and report.
