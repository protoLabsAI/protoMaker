---
tags: []
summary: "relevantTo: []"
relevantTo: []
importance: 0.5
relatedFiles: []
usageStats:
  loaded: 217
  referenced: 37
  successfulFeatures: 37
---
# GTM Signal Intelligence & Content Operations

## Status: ACTIVE — Linear project created, content pipeline running

## Date: 2026-02-21

## Social Handles

- **Twitter/X**: @protoLabsAI (https://x.com/protoLabsAI)
- **YouTube**: @protoLabsAI (https://www.youtube.com/@protoLabsAI)
- **Domain**: protolabs.studio
- **Glyphkit**: glyphkit.design → glyphkit.protolabs.studio
- **Google Workspace**: Setting up (protolabs.studio domain)

## Linear Project

- URL: https://linear.app/protolabsai/project/gtm-signal-intelligence-and-content-operations-64cabf023337
- ID: 76d33bc7-22d2-44d2-99ea-cc25a0797ad6
- Issues: PRO-252 through PRO-257

## Research Completed

- Codebase deep-research: Full audit of content pipeline, signal intake, monitors, event bus, MCP patterns, OAuth flows
- External due diligence: Social media APIs, Twitch→YouTube tools, Google Workspace, analytics, competitive landscape

## Vision

Build signal monitoring and content operations infrastructure. Listen before we speak. Monitor incoming engagement across Twitter/X, YouTube, Substack, Twitch. Route signals through existing event bus and GTM pipeline. Establish Twitch→YouTube content pipeline for Mon/Wed/Fri streams.

## What Already Exists (Codebase)

- **Content creation pipeline**: 7-phase LangGraph flow, 3 antagonistic review gates, HITL, multi-format output
- **Signal intake service**: Rule-based classifier, ops vs gtm routing, generic SignalPayload interface — EXTENSIBLE
- **Monitor service pattern**: Discord, GitHub, Linear monitors all follow same polling pattern — TEMPLATE for social monitors
- **Twitch integration**: MVP shipped (PRs #703-705). !idea command, suggestions, polls, overlay
- **Discord as aggregation layer**: 20+ MCP tools, keyword detection, channel routing
- **Event bus**: 347+ event types, GTM events already typed
- **OAuth pattern**: Linear reference implementation — template for Google Workspace
- **Pipeline orchestrator**: Has explicit gtm branch with phase mapping

## Critical Gaps

1. No social media signal sources (Twitter, YouTube, Substack)
2. No content distribution (pipeline creates but can't publish)
3. No Google Workspace integration
4. MCP server monolithic (80+ tools in single index.ts)

## Workstreams (6)

### 1. Signal Monitoring Infrastructure (PRIORITY)

- SocialMonitor service following DiscordMonitor/GitHubMonitor/LinearMonitor pattern
- Twitter/X: TwitterAPI.io (~$5/mo pay-as-you-go)
- YouTube: Data API v3 (free, 10K units/day)
- Substack: RSS feed polling (free)
- Wire Twitch into SignalIntakeService (currently siloed)
- n8n self-hosted on staging for signal aggregation
- All signals → signal:received → SignalIntakeService → GTM Agent

### 2. Twitch → YouTube Content Pipeline

- Mon/Wed/Fri 1hr live coding streams
- OBS → MKV local recording
- OpusClip for AI clip detection (free 60 min/mo)
- Gling ($10/mo) for filler word cleanup
- YouTube Studio / TubeBuddy for scheduling Shorts

### 3. Google Workspace Integration

- Install taylorwilsdon/google_workspace_mcp (100+ tools, OAuth 2.1)
- Calendar for scheduling
- Gmail for email I/O with HITL approval gates
- Calendar webhooks → Discord reminders

### 4. Content Production

- Personal blog: "Everywhere all at once: the age of invisible machines"
- Glyphkit Storybook release (MythXEngine design system)
- Content pipeline flows via Cindi

### 5. Analytics & Attribution

- Umami self-hosted on staging ($0)
- UTM parameter system
- YouTube Studio + Twitch native analytics

### 6. Infrastructure Hardening

- Modularize MCP server before adding 20+ new tools
- Add social sources to SignalIntakeService classification
- Discord channel structure (#signals-urgent, #signals-engagement)

## External Tool Stack (~$25-50/mo)

| Tool                 | Cost   | Purpose                    |
| -------------------- | ------ | -------------------------- |
| TwitterAPI.io        | ~$5/mo | X mention monitoring       |
| YouTube Data API     | $0     | Comment monitoring         |
| Substack RSS         | $0     | Post monitoring            |
| OpusClip             | $0     | AI clip detection          |
| Gling                | $10/mo | Filler word cleanup        |
| TubeBuddy            | $9/mo  | YouTube SEO + scheduling   |
| Umami                | $0     | Self-hosted analytics      |
| n8n                  | $0     | Self-hosted signal routing |
| Google Workspace MCP | $0     | Calendar + email           |

## Architecture

```
Twitter mentions (TwitterAPI.io) ──┐
YouTube comments (Data API poll) ──┤── SocialMonitor / n8n ──> signal:received
Substack comments (RSS + poll)   ──┤                           │
Twitch suggestions (existing)    ──┘                           ▼
                                                        SignalIntakeService
                                                         (classify: gtm)
                                                              │
                                                              ▼
                                                        GTM Agent (Jon+Cindi)
                                                              │
                                                              ▼
                                                        Discord #signals
                                                        + Board feature if actionable
```

## Competitive Intel

- OpenClaw: 140K stars, personal assistant not dev tool. Gateway+Agent Loop+Heartbeat architecture similar to Automaker
- Cursor/Windsurf/Devin: Enterprise pivot, $100M+ ARR via product-led growth
- Lovable: Fastest to $100M ARR in history (~8 months)
- Build in public: 70/30 rule (70% distribution, 30% building). Revenue transparency. Ship weekly, post daily.
- Key insight: "The strongest solo companies behave like media businesses first and product businesses second."

## Josh's Content Plans

- Twitch: Mon/Wed/Fri 1hr live coding + Q&A
- YouTube: Cut streams into scheduled Shorts
- Blog: "Everywhere all at once: the age of invisible machines" (personal)
- Glyphkit: Release Storybook for MythXEngine design system
- Google Workspace: Calendar + email with HITL

## Dependencies (Josh action items)

- Google Workspace account setup
- Twitter/X account access for monitoring API
- YouTube channel configured
- Twitch streaming setup (OBS, scenes, overlays)
- n8n deployment on staging
