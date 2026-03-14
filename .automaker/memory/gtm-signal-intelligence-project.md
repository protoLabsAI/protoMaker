---
tags: []
summary: "relevantTo: []"
relevantTo: []
importance: 0.5
relatedFiles: []
usageStats:
  loaded: 324
  referenced: 83
  successfulFeatures: 83
---
<!-- domain: GTM Signal Intelligence | Go-to-market signal processing and routing -->

# GTM Signal Intelligence & Content Operations

## Status: ACTIVE — content pipeline running (Note: Linear deprecated 2026-03-04; project management moved to in-app board)

## Date: 2026-02-21

## Social Handles

- **Twitter/X**: @protoLabsAI (https://x.com/protoLabsAI)
- **YouTube**: @protoLabsAI (https://www.youtube.com/@protoLabsAI)
- **Domain**: protolabs.studio
- **Glyphkit**: glyphkit.design → glyphkit.protolabs.studio
- **Google Workspace**: Setting up (protolabs.studio domain)

## Linear Project (DEPRECATED)

Linear was deprecated 2026-03-04. Project management for this workstream has moved to the in-app board. The Linear project below is archived and no longer active.

- URL: https://linear.app/protolabsai/project/gtm-signal-intelligence-and-content-operations-64cabf023337 (archived)
- ID: 76d33bc7-22d2-44d2-99ea-cc25a0797ad6
- Issues: PRO-252 through PRO-257

## Research Completed

- Codebase deep-research: Full audit of content pipeline, signal intake, monitors, event bus, MCP patterns, OAuth flows
- External due diligence: Social media APIs, Google Workspace, analytics, competitive landscape

## Vision

Build signal monitoring and content operations infrastructure. Listen before we speak. Monitor incoming engagement across Twitter/X, YouTube, Substack. Route signals through existing event bus and GTM pipeline.

## What Already Exists (Codebase)

- **Content creation pipeline**: 7-phase LangGraph flow, 3 antagonistic review gates, HITL, multi-format output
- **Signal intake service**: Rule-based classifier, ops vs gtm routing, generic SignalPayload interface — EXTENSIBLE
- **Monitor service pattern**: Discord, GitHub monitors follow same polling pattern — TEMPLATE for social monitors (Linear monitor was removed with Linear deprecation)
- **Discord as aggregation layer**: 20+ MCP tools, keyword detection, channel routing
- **Event bus**: 347+ event types, GTM events already typed
- **OAuth pattern**: GitHub OAuth is the reference implementation — template for Google Workspace (Linear OAuth no longer in use)
- **Pipeline orchestrator**: Has explicit gtm branch with phase mapping

## Critical Gaps

1. No social media signal sources (Twitter, YouTube, Substack)
2. No content distribution (pipeline creates but can't publish)
3. No Google Workspace integration
4. MCP server monolithic (80+ tools in single index.ts)

## Workstreams (6)

### 1. Signal Monitoring Infrastructure (PRIORITY)

- SocialMonitor service following DiscordMonitor/GitHubMonitor pattern
- Twitter/X: TwitterAPI.io (~$5/mo pay-as-you-go)
- YouTube: Data API v3 (free, 10K units/day)
- Substack: RSS feed polling (free)
- n8n self-hosted on staging for signal aggregation
- All signals → signal:received → SignalIntakeService → GTM Agent

### 2. Google Workspace Integration

- Install taylorwilsdon/google_workspace_mcp (100+ tools, OAuth 2.1)
- Calendar for scheduling
- Gmail for email I/O with HITL approval gates
- Calendar webhooks → Discord reminders

### 3. Content Production

- Personal blog: "Everywhere all at once: the age of invisible machines"
- Glyphkit Storybook release (MythXEngine design system)
- Content pipeline flows via Cindi

### 5. Analytics & Attribution

- Umami self-hosted on staging ($0)
- UTM parameter system
- YouTube Studio native analytics

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
                                  ──┘                           ▼
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

- YouTube: Scheduled Shorts and tutorials
- Blog: "Everywhere all at once: the age of invisible machines" (personal)
- Glyphkit: Release Storybook for MythXEngine design system
- Google Workspace: Calendar + email with HITL

## Dependencies (Josh action items)

- Google Workspace account setup
- Twitter/X account access for monitoring API
- YouTube channel configured
- n8n deployment on staging
