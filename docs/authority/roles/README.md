# Roles - Active Team

This folder contains role definitions for positions currently being filled. Only roles with someone (human or AI) actively in the seat belong here.

## Current Roster

| Role                                  | Filled By         | Status |
| ------------------------------------- | ----------------- | ------ |
| [CEO/CTO & Founder](./ceo-founder.md) | Josh (Human)      | Active |
| [Chief of Staff](./chief-of-staff.md) | Ava Loveland (AI) | Active |

## Dormant Roles (In Code, Not Staffed)

These agent roles exist in the codebase but aren't actively being operated as part of the team structure yet. They run as automated services, not as staffed positions:

- **PM Agent** - Runs idea review pipeline. Could evolve into a staffed Product Director role.
- **ProjM Agent** - Runs project decomposition. Could evolve into a staffed Program Manager role.
- **EM Agent** - Runs work assignment. Could evolve into a staffed Engineering Lead role.
- **Status Monitor** - Runs health checks. Part of the Chief of Staff's operational awareness.

## When to Add a New Role

Add a role file here when:

1. The Chief of Staff identifies a responsibility area that's consistently overloaded
2. We have the infrastructure to support the role (events, tools, memory)
3. The role has a clear owner (human or AI agent) who will actively fill it

Don't add roles speculatively. This folder reflects reality, not aspirations.

## Role File Template

Each role file should cover:

- What the role does (current, not aspirational)
- What it needs from the org
- What signals it consumes and generates
- How to tell when it's overloaded
- How it will evolve
