# Brand Identity

This is the living brand bible for protoLabs. All agents, content, and external communication should align with these guidelines.

## Names & Domains

| Name                  | What It Is                            | Usage                                                                                            |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **protoLabs**         | The AI-native development agency      | Always camelCase: "protoLabs" (not "ProtoLabs", "Protolabs", or "Proto Labs")                    |
| **protoLabs.studio**  | Primary domain                        | Website, social bios, email                                                                      |
| **protoMaker**        | The AI development studio product     | Kanban board + autonomous agents. The tool that powers the agency.                               |
| **proto-labs-ai**     | GitHub organization                   | `github.com/proto-labs-ai`                                                                       |
| **Automaker**         | Internal codename / upstream origin   | Used in code (`@automaker/*` packages, `.automaker/` directory). NOT used in external marketing. |
| **create-protolab**   | npx CLI tool                          | Scaffolds new projects with protoLabs methodology                                                |
| **rabbit-hole**       | AI-powered TTRPG                      | Built with protoMaker. Proof of concept product.                                                 |
| **proto-ux**          | UX automation toolkit                 | Proof of concept product.                                                                        |
| **Agentic Jumpstart** | Community Discord / educational brand | Community-facing, not the agency brand                                                           |

### Naming Rules

- External content uses **protoLabs** and **protoMaker** — never "Automaker"
- Internal code keeps `@automaker/*` package names and `.automaker/` directories (intentional — renaming the codebase would break everything)
- When referring to the product in docs or content: "protoMaker" or "protoLabs Studio"
- The distinction matters: protoLabs = the agency, protoMaker = the tool

## Voice & Tone

### Josh Mabry — Positioning

**Who Josh is:** Architect, founder, technical leader. NOT a developer — an orchestrator who designs systems and directs AI agents to build them.

**Background:** Former Principal Application Architect at Vizient. Now building protoLabs — the first AI-native development agency.

**Language rules:**

- USE: "architect, orchestrate, ship, design, direct, build (systems)"
- NEVER USE: "coded, built in React, implemented, programmed, developed"
- Josh architects systems. AI agents implement them. This distinction IS the brand.

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

| Name             | Role                       | Type     | Notes                                                                    |
| ---------------- | -------------------------- | -------- | ------------------------------------------------------------------------ |
| **Josh Mabry**   | Founder / Project Owner    | Human    | Architect. Directs everything.                                           |
| **Ava Loveland** | Chief of Staff             | AI Agent | Operational automation, agent management. The proof AI teammates work.   |
| **Jon**          | GTM Specialist             | AI Agent | Content strategy, brand positioning, social media, launch execution.     |
| **Matt**         | Frontend Engineer          | AI Agent | React 19, design systems, Storybook, component architecture.             |
| **Sam**          | AI Agent Engineer          | AI Agent | LangGraph flows, LLM providers, observability, multi-agent coordination. |
| **Frank**        | DevOps Engineer            | AI Agent | Staging infra, deployments, health monitoring, system reliability.       |
| **Cindi**        | Content Writing Specialist | AI Agent | Blog posts, technical docs, SEO, content pipeline.                       |
| **Abdellah**     | Strategy Partner           | Human    | Personal branding, visual identity. NOT content creation.                |

## Content Strategy

### Platforms (Priority Order)

1. **Twitter/X** — Daily. 40% show work, 30% insights, 20% threads, 10% engagement
2. **Twitch** — 2-3x/week. Live building sessions, architecture discussions
3. **YouTube** — VODs from Twitch streams, edited tutorials
4. **Instagram** — Visual brand moments, studio aesthetics
5. **TikTok** — Short clips from streams, hot takes

### Content Pillars

- **Show the work** — Architecture decisions, agent orchestration, system design
- **Insights** — What AI-native development actually looks like day to day
- **Threads** — Deep dives on methodology, orchestration patterns, agent design
- **Engagement** — Community interaction, building in public

### Core Principle

"One effort, many surfaces." Every work session generates content that flows to all channels.

### Pipeline

Work -> Capture -> Source Content -> Repurpose -> All Channels Fed

## Revenue Model

1. **Open source** — protoMaker is source-available (Automaker License). Builds community trust and distribution.
2. **Paid content** — Methodology, tutorials, tips & tricks behind paywalls. The tool is free; the knowledge of how to orchestrate it is the product.
3. **Consulting** — setupLab offering. Help companies set up their own proto labs. Template repos and guided onboarding.

## Operating Principles

1. **Proof through products** — No claim without a working demo
2. **Build in public** — Share decisions, tradeoffs, failures, and wins
3. **Orchestration over implementation** — Demonstrate the methodology in everything
4. **Community first** — Open process, enable others
5. **Ship fast** — MVPs over perfection, iterate on feedback

## License

The Automaker License is source-available, NOT open source by OSI standards. Users can:

- Use the tool internally
- Build products USING the tool

Users cannot:

- Resell, redistribute, or sublicense the tool itself
- Host it as SaaS for others
- Extract and resell prompts or instructional content

This will be revisited when the product is ready for full open source release.
