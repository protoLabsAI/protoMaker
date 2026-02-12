# PRD: Agile Ceremony Automation

## Situation
Automaker already detects milestone and project completion via ProjM agent (15s polling), emits milestone:completed and project:completed events, and the IntegrationService posts one-line notifications to Discord. DiscordSettings already has notifyOnMilestoneComplete and notifyOnProjectComplete flags. EventHookTrigger supports configurable actions but lacks milestone/project triggers. Feature data (cost, duration, errors, PRs) exists but is not aggregated into event payloads.

## Problem
Milestone and project completion notifications are one-line messages with zero context. Teams get '🏁 Project X - Milestone 1 completed: Foundation' but no stats on what shipped, what failed, what the cost was, or what's next. There's no retrospective analysis — lessons learned, patterns of failure, and action items are lost. This means the team has no automated way to reflect on completed work or celebrate wins. Manual retros are inconsistent and often skipped.

## Approach
Create a CeremonyService that subscribes to milestone:completed and project:completed events, loads feature/project data, generates rich ceremony content using templates (for structure) plus LLM (for retro analysis and engagement), and posts to Discord. Add ceremony configuration to ProjectSettings for per-project control (enable/disable, channel override, template selection). Extend EventHookTrigger with milestone_completed and project_completed for user-configurable hooks. Enrich event payloads from ProjM agent with aggregated feature stats.

## Results
Every milestone completion auto-posts a rich update to Discord #dev with: features shipped, PRs merged, cost, duration, blockers encountered, and what's next. Every project completion auto-posts an LLM-generated retro with: what shipped, what went well, what went wrong, lessons learned, and action items. All content is auto-generated, requiring zero manual effort. Per-project config allows teams to customize channel, toggle ceremonies, and adjust templates.

## Constraints
Must not duplicate existing Discord notifications (IntegrationService already posts one-liners — replace, don't add). LLM calls for retros must use simpleQuery pattern (existing in codebase). Discord messages have 2000 char limit — split long content into multiple messages. Must work with MCP Discord tools (not DiscordBotService directly, since that has hardcoded channels). Templates must be customizable per-project via .automaker/context/ or settings.
