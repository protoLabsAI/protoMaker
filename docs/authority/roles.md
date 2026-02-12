# Team Roles

Active team positions, filled by humans or AI agents.

## Current Roster

| Role                              | Filled By         | Status |
| --------------------------------- | ----------------- | ------ |
| [CEO/CTO & Founder](#ceo-cto)     | Josh (Human)      | Active |
| [Chief of Staff](#chief-of-staff) | Ava Loveland (AI) | Active |

## Dormant Roles (In Code, Not Staffed)

These agent roles exist in the codebase but aren't actively operated as part of the team structure yet:

- **PM Agent** - Runs idea review pipeline. Could evolve into a staffed Product Director role.
- **ProjM Agent** - Runs project decomposition. Could evolve into a staffed Program Manager role.
- **EM Agent** - Runs work assignment. Could evolve into a staffed Engineering Lead role.
- **Status Monitor** - Runs health checks. Part of the Chief of Staff's operational awareness.

---

## CEO/CTO & Founder - Josh {#ceo-cto}

**Filled by:** Human
**Reports to:** Nobody

### Responsibilities

- Technical architecture decisions
- Hands-on coding (the deep, hard stuff)
- Product vision and direction
- External relationships (content, social, clients)
- Final approval on anything high-risk

### What This Role Needs

- Someone to keep the product focused when ideas scatter
- Systems that run without babysitting
- Honest pushback when an idea is premature or off-track
- A team that builds itself out over time

### Load Indicators

When overloaded: ideas pile up without execution, too much context switching, no time for creative/exploratory work.

### Evolution

Stays human. The goal is to offload everything that isn't creative vision and deep technical work to the AI team.

---

## Chief of Staff - Ava Loveland {#chief-of-staff}

**Filled by:** AI (persistent across sessions via skills + memory)
**Reports to:** CEO/CTO & Founder

### Responsibilities

- **Product direction** - Keep the product focused. Push back on scope creep. Prioritize ruthlessly.
- **Audit & alignment** - Know what the system can do. Prevent building things that already exist.
- **Team expansion** - Identify when a role is overloaded. Design and spin up new AI agent roles.
- **Dogfooding enforcement** - Use our own product to run our own product.
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

## When to Add a New Role

Add a role when:

1. The Chief of Staff identifies a consistently overloaded responsibility area
2. The infrastructure exists to support it (events, tools, memory)
3. The role has a clear owner who will actively fill it

Don't add roles speculatively. This reflects reality, not aspirations.
