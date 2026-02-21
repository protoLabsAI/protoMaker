# Brand Identity

This is the living brand bible for protoLabs. All agents, content, and external communication should align with these guidelines.

## Names & Domains

| Name                           | What It Is                          | Usage                                                                                                        |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **protoLabs**                  | The AI-native development agency    | Always camelCase: "protoLabs" (not "ProtoLabs", "Protolabs", or "Proto Labs")                                |
| **protoLabs.studio**           | Primary domain                      | Website, social bios, email                                                                                  |
| ~~**protoMaker**~~             | RETIRED — now just protoLabs        | Was the product name. Consolidated into protoLabs. Do not use in new content.                                |
| **proto-labs-ai**              | GitHub organization                 | `github.com/proto-labs-ai`                                                                                   |
| **Automaker**                  | Internal codename / upstream origin | Used in code (`@automaker/*` packages, `.automaker/` directory). NOT used in external marketing.             |
| **create-protolab**            | npx CLI tool                        | Scaffolds new projects with protoLabs methodology                                                            |
| **MythXEngine**                | AI-powered TTRPG engine             | Built with protoLabs. Portfolio proof of methodology.                                                        |
| **SVGVal**                     | SVG validation toolkit              | Built with protoLabs. Portfolio proof of methodology.                                                        |
| **rabbit-hole**                | AI-powered research platform        | Built with protoLabs. Portfolio proof of methodology.                                                        |
| **intelligent product engine** | Product category / positioning term | Describes the autonomous system architecture. NOT an acronym — always lowercase, always spelled out in full. |

### Naming Rules

- External content uses **protoLabs** — never "Automaker" or "protoMaker"
- Internal code keeps `@automaker/*` package names and `.automaker/` directories (intentional — renaming the codebase would break everything)
- When referring to the product in docs or content: "protoLabs" or "protoLabs Studio"
- protoLabs is both the agency AND the tool. No separate product name.

## Voice & Tone

### Josh Mabry — Positioning

**Who Josh is:** Architect, founder, AI systems expert. Three years deep in agentic AI — building production systems from design to deployment since LLMs had 4K context windows. Not someone who discovered AI coding tools last month. An expert who 10x'd his workflow through AI tooling, then 10x'd again by building autonomous agent orchestration.

**Background:** 8+ years shipping production software. Design systems architect for Fortune 500 clients (Phase2 Technology), AI lead at a SaaS platform (Knapsack), now founder of protoLabs. Has built countless AI systems — RAG pipelines, multi-agent research platforms, generative gaming engines, autonomous dev tooling. Was "vibe coding" before the term existed, copy-pasting into 4K context windows and telling anyone who'd listen to learn these systems.

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

| Name             | Role                       | Type     | Notes                                                                    |
| ---------------- | -------------------------- | -------- | ------------------------------------------------------------------------ |
| **Josh Mabry**   | Founder / Project Owner    | Human    | Architect. Directs everything.                                           |
| **Ava Loveland** | Operations                 | AI Agent | Signal triage, antagonistic review, ceremonies, Discord.                 |
| **Jon**          | GTM                        | AI Agent | Content strategy, brand positioning, antagonistic review (market value). |
| **Cindi**        | Content Writing Specialist | AI Agent | Blog posts, technical docs, SEO, content pipeline.                       |
| **Abdellah**     | Strategy Partner           | Human    | Personal branding, visual identity. NOT content creation.                |

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

**Philosophy: No SaaS, no subscriptions, no obligations.** Build cool things, share how, let people pay once for the knowledge. Indie maker, not startup.

1. **Free tool** — protoLabs is source-available. Builds community trust and distribution.
2. **$49 lifetime Pro** — Written tutorials, agent templates, prompt library, methodology guide. One-time payment, lifetime access. No recurring obligations on either side.
3. **Consulting** — setupLab offering. Happens organically when people see the work and want help. Not outbound sales — inbound from community trust.

## Operating Principles

1. **Proof through products** — No claim without a working demo
2. **Build in public** — Share decisions, tradeoffs, failures, and wins
3. **Orchestration over implementation** — Demonstrate the methodology in everything
4. **Community first** — Open process, enable others
5. **Ship fast** — MVPs over perfection, iterate on feedback

## License

Source-available under the Automaker License (FSL-style). NOT open source by OSI standards. Users can:

- Use the tool internally
- Build products USING the tool
- View and learn from the source code

Users cannot:

- Resell, redistribute, or sublicense the tool itself
- Host it as SaaS for others
- Extract and resell prompts or instructional content

License decision pending: evaluating Functional Source License (FSL) which auto-converts to Apache 2.0 after 2 years. See PRO-128 and PRO-159 in Linear.
