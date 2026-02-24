# Brand Identity

This is the living brand bible for protoLabs. All agents, content, and external communication should align with these guidelines.

## Names & Domains

| Name                           | What It Is                          | Usage                                                                                                                                                                  |
| ------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **protoLabs**                  | The AI-native development agency    | Always camelCase: "protoLabs" (not "ProtoLabs", "Protolabs", or "Proto Labs")                                                                                          |
| **protoLabs.studio**           | Primary domain                      | Website, social bios, email                                                                                                                                            |
| ~~**protoMaker**~~             | RETIRED — now just protoLabs        | Was the product name. Consolidated into protoLabs. Do not use in new content.                                                                                          |
| **proto-labs-ai**              | GitHub organization                 | `github.com/proto-labs-ai`                                                                                                                                             |
| **Automaker**                  | Internal codename / upstream origin | Used in code (`@protolabs-ai/*` packages, `.automaker/` directory). NOT used in external marketing. We are the maintained successor of the original Automaker project. |
| **create-protolab**            | npx CLI tool                        | Scaffolds new projects with protoLabs methodology                                                                                                                      |
| **MythXEngine**                | AI-powered TTRPG engine             | Built with protoLabs. Portfolio proof of methodology.                                                                                                                  |
| **SVGVal**                     | SVG validation toolkit              | Built with protoLabs. Portfolio proof of methodology.                                                                                                                  |
| **rabbit-hole**                | AI-powered research platform        | Built with protoLabs. Portfolio proof of methodology.                                                                                                                  |
| **intelligent product engine** | Product category / positioning term | Describes the autonomous system architecture. NOT an acronym — always lowercase, always spelled out in full.                                                           |

### Naming Rules

- External content uses **protoLabs** — never "Automaker" or "protoMaker"
- Internal code keeps `@protolabs-ai/*` package names and `.automaker/` directories (intentional — renaming the codebase would break everything)
- When referring to the product in docs or content: "protoLabs" or "protoLabs Studio"
- protoLabs is both the agency AND the tool. No separate product name.

## Voice & Tone

### Founder — Positioning

**Who the founder is:** Architect, founder, AI systems expert. Three years deep in agentic AI — building production systems from design to deployment since LLMs had 4K context windows. Not someone who discovered AI coding tools last month. An expert who 10x'd his workflow through AI tooling, then 10x'd again by building autonomous agent orchestration.

**Background:** 8+ years shipping production software. Experienced systems architect and AI engineer, now founder of protoLabs. Has built countless AI systems — RAG pipelines, multi-agent research platforms, generative gaming engines, autonomous dev tooling. Was "vibe coding" before the term existed, copy-pasting into 4K context windows and telling anyone who'd listen to learn these systems.

**Language rules:**

- USE: "architect, orchestrate, ship, design, direct, build (systems)"
- AVOID: "coded, implemented, programmed" (in present tense — Josh orchestrates now, but he earned that position through years of hands-on AI systems work)
- Josh's authority comes from deep experience, not just tooling. He built the systems that build the systems.

### Brand Voice

- **Technical** — Speak to builders, not marketers
- **Direct** — No hedging, no corporate speak, no filler
- **Pragmatic** — Show real results, not promises
- **Authentic** — Share failures alongside wins. No polished veneer.
- **Opinionated** — Take positions. "Orchestration beats implementation" is a stance.

### What We Never Say

- Generic AI hype ("revolutionizing", "transforming", "game-changing")
- "Look what I coded" (Josh doesn't code — agents do)
- Feature lists without context or proof
- Marketing fluff that doesn't match the direct voice
- Comparisons that punch down at competitors

## Team

The team is organized into **Operations** and **Engineering** branches. Orchestration agents use domain tools (feature management, git ops, Linear, Discord) and subagents rather than direct agent execution for every task.

### Operations

| Name               | Role                       | Type     | Notes                                                                    |
| ------------------ | -------------------------- | -------- | ------------------------------------------------------------------------ |
| **Founder**        | Project Owner              | Human    | Architect. Directs everything.                                           |
| **AVA**            | Operations                 | AI Agent | Signal triage, antagonistic review, ceremonies, Discord.                 |
| **Jon**            | GTM                        | AI Agent | Content strategy, brand positioning, antagonistic review (market value). |
| **Cindi**          | Content Writing Specialist | AI Agent | Blog posts, technical docs, SEO, content pipeline.                       |
| _Strategy Partner_ | Strategy Partner           | Human    | Personal branding, visual identity. NOT content creation.                |

### Engineering

| Name              | Role                 | Type     | Notes                                                                    |
| ----------------- | -------------------- | -------- | ------------------------------------------------------------------------ |
| **Lead Engineer** | Production Orchestr. | Service  | Fast-path rules, auto-mode management, event-driven orchestration.       |
| **Matt**          | Frontend Engineer    | AI Agent | React 19, design systems, Storybook, component architecture.             |
| **Sam**           | AI Agent Engineer    | AI Agent | LangGraph flows, LLM providers, observability, multi-agent coordination. |
| **Frank**         | DevOps Engineer      | AI Agent | Staging infra, deployments, health monitoring, system reliability.       |
| **Kai**           | Backend Engineer     | AI Agent | Server-side features, API design, database, services.                    |

## Content Strategy

### Platforms (Priority Order)

1. **Twitter/X** — Primary. Show the work, insights, threads, engagement.
2. **Twitch** — Live building sessions when it makes sense. Not a fixed schedule.
3. **YouTube** — VODs from Twitch streams, edited tutorials.

### Content Pillars

- **Show the work** — Architecture decisions, agent orchestration, system design
- **Insights** — What AI-native development actually looks like day to day
- **Threads** — Deep dives on methodology, orchestration patterns, agent design
- **Engagement** — Community interaction, building in public

### Core Principle

"One effort, many surfaces." Content generation is automated — Cindi writes, Jon strategizes, schedulers distribute. Josh's role is to engage with people, not produce content manually.

### Pipeline

Work -> AI generates content -> Schedule across platforms -> Josh engages with responses

## Revenue Model

**Philosophy: Open source first. Build the community, prove the tool, let revenue follow naturally.**

protoLabs is the maintained successor to the original Automaker project. The original maintainers moved on — we picked it up, rebuilt it, and ship real products with it. That lineage gives us a built-in community and credibility that no cold-start marketing can match.

1. **Open source tool** — protoLabs is fully open source. Community adoption is the growth engine.
2. **Portfolio proof** — We use protoLabs to build our own products (MythXEngine, SVGVal, rabbit-hole). The tool proves itself through what it ships.
3. **Consulting (organic)** — setupLab offering. Happens when people see the work and want help setting up their own autonomous dev pipeline. Inbound from community trust, never outbound sales.

**What we don't do:** No paid tiers, no subscriptions, no paywalls on content or methodology. Everything is open. Trust compounds faster than revenue.

## Operating Principles

1. **Proof through products** — No claim without a working demo
2. **Build in public** — Share decisions, tradeoffs, failures, and wins
3. **Orchestration over implementation** — Demonstrate the methodology in everything
4. **Community first** — Open process, enable others
5. **Ship fast** — MVPs over perfection, iterate on feedback

## License

**MIT License.** Maximum community adoption, zero restrictions beyond standard open source terms.

The upstream Automaker project changed to MIT and is no longer actively maintained. As the maintained successor, we adopted MIT to match — giving everyone equal rights to use, modify, distribute, and build on protoLabs without restriction. No special Core Contributor privileges, no copyright assignment on contributions, no SaaS restrictions.

The LICENSE file preserves dual copyright: the original Automaker contributors (2025) and Proto Labs AI (2025-2026).

## Community Strategy

protoLabs is the maintained successor fork of the original Automaker project. The original maintainers have moved on. One of them has ~250K YouTube subscribers and remains in the community Discord.

**The play:**

1. **Be the real successor** — actively maintain, improve, and ship with the tool
2. **Build in the existing community** — engage in their Discord, contribute upstream context, be helpful
3. **Prove it by using it** — every protoLabs project (MythXEngine, SVGVal, rabbit-hole) is built with the tool. No demos, only production use.
4. **Let the community grow organically** — the work speaks. People who see autonomous agents shipping real PRs will want to try it.

**What we don't do:** No growth hacking, no paid acquisition, no influencer campaigns. Build great software, share how, let people find it.
