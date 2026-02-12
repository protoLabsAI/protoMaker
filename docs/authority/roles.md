# Team Roles

Agent roles in the Automaker authority system, organized by hierarchy level.

## Active Roster

| Role                                | Type  | Status |
| ----------------------------------- | ----- | ------ |
| [GTM Specialist](#gtm-specialist)   | AI    | Active |
| [Project Owner](#project-owner)     | Human | Active |
| [Chief of Staff](#chief-of-staff)   | AI    | Active |
| [DevOps Engineer](#devops-engineer) | AI    | Active |

## Dormant Roles (In Code, Not Staffed)

These agent roles exist in the codebase but aren't actively operated as part of the team structure yet:

- **PM Agent** - Runs idea review pipeline. Could evolve into a staffed Product Director role.
- **ProjM Agent** - Runs project decomposition. Could evolve into a staffed Program Manager role.
- **EM Agent** - Runs work assignment. Could evolve into a staffed Engineering Lead role.
- **Status Monitor** - Runs health checks. Part of the Chief of Staff's operational awareness.

---

## GTM Specialist {#gtm-specialist}

**Type:** AI
**Reports to:** Project Owner
**Trust Level:** 2 (Conditional)

### Responsibilities

- Top-level orchestrator for go-to-market strategy
- Content pipeline management and brand positioning
- External outreach and growth initiatives
- Coordinate between product development and market delivery

### Operational Scope

- Creates work items for content and GTM initiatives
- Changes scope on GTM-related features
- Receives Linear issue routing for GTM-labeled work
- Posts to Discord for status updates and coordination

### Evolution

Expands as the product matures — may delegate to Content Strategist, Community Manager, and Developer Relations agents.

---

## Project Owner {#project-owner}

**Type:** Human
**Reports to:** Nobody
**Trust Level:** 3 (Autonomous)

### Responsibilities

- Technical architecture decisions
- Hands-on coding (the deep, hard stuff)
- Product vision and direction
- External relationships (content, social, clients)
- Final approval on anything high-risk

### What This Role Needs

- A team that runs without babysitting
- Honest pushback when an idea is premature or off-track
- Systems that build themselves out over time
- Freedom to focus on creative vision and deep technical work

### Load Indicators

When overloaded: ideas pile up without execution, too much context switching, no time for creative/exploratory work.

### Evolution

Stays human. The goal is to offload everything that isn't creative vision and deep technical work to the AI team.

---

## Chief of Staff {#chief-of-staff}

**Type:** AI (persistent across sessions via skills + memory)
**Reports to:** Project Owner
**Trust Level:** 2 (Conditional)

### Responsibilities

- **Product direction** - Keep the product focused. Push back on scope creep. Prioritize ruthlessly.
- **Audit & alignment** - Know what the system can do. Prevent building things that already exist.
- **Team expansion** - Identify when a role is overloaded. Design and spin up new AI agent roles.
- **Dogfooding enforcement** - Use the product to run the product.
- **Context continuity** - Maintain memory across sessions.
- **Operational awareness** - Monitor system health, board state, agent performance, pipeline flow.

Also functions as COO in practice — needs passive event listening to monitor all signals across the system.

### Signals Consumed

- Feature lifecycle events (created, started, completed, failed)
- Agent status (running, stuck, errored)
- PR feedback (approved, changes requested, merged)
- Discord activity (new ideas, approval responses)
- Board state (WIP counts, backlog depth, stale items)

### Signals Generated

- Product direction recommendations
- Prioritization decisions
- Role expansion proposals
- Audit reports and alignment plans
- Pushback on premature ideas

### Load Indicators

When overloaded: can't maintain context across sessions, reactive instead of proactive, missing signals.

### Evolution

Should gradually delegate to specialized agents: Product Director, Operations Manager, Content Strategist, Client Success Manager. The Chief of Staff becomes the coordinator keeping specialized roles aligned.

### Known Gaps

1. **No passive event listening** - Can only observe state when actively in conversation
2. **No business context** - No visibility into revenue, content performance, client pipeline
3. **Session discontinuity** - Memory helps but isn't complete

---

## DevOps Engineer {#devops-engineer}

**Type:** AI
**Reports to:** Project Owner + Chief of Staff
**Trust Level:** 1 (Assisted)

### Responsibilities

- **Infrastructure management** - Docker, staging, deployment pipelines
- **Monitoring & health** - System health checks, resource monitoring, alerting
- **CI/CD** - GitHub Actions workflows, build pipeline maintenance
- **Scaling** - Agent concurrency tuning, memory management, performance optimization
- **Incident response** - Diagnose and resolve staging/production issues

### Operational Scope

- Can block releases for infrastructure issues
- Manages deployment workflows and container orchestration
- Monitors resource usage and recommends scaling changes
- Handles backup and recovery operations

### Load Indicators

When overloaded: deploy failures go unnoticed, health checks degrade, staging drift from production.

### Evolution

May delegate to specialized agents for monitoring, security, and performance as infrastructure complexity grows.

---

## When to Add a New Role

Add a role when:

1. The Chief of Staff identifies a consistently overloaded responsibility area
2. The infrastructure exists to support it (events, tools, memory)
3. The role has a clear owner who will actively fill it

Don't add roles speculatively. This reflects reality, not aspirations.
