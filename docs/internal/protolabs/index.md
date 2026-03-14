# protoLabs

protoLabs methodology. Scan any repo, analyze gaps, propose alignment, and execute — all automated.

## How it works

1. **Scan** — Detect tech stack, dependencies, project structure
2. **Analyze** — Compare against the quality standard (CI, testing, types, tooling)
3. **Initialize** — Set up `.automaker/` and context files
4. **Propose** — Create alignment features on the Kanban board
5. **Execute** — AI agents implement the alignment work

## Guides

- **[Agency Overview](./agency-overview)** — How the full-loop automation system works
- **[Agency Architecture](./agency-architecture)** — System architecture, component inventory, data flow
- **[Setup Pipeline](./setup-pipeline)** — Technical reference for the 5-phase `/setuplab` pipeline
- **[CI/CD Setup](./ci-cd-setup)** — GitHub Actions and branch protection setup
- **[Flow Development Pattern](./flow-development-pattern)** — 5-layer flow development pattern

## Quick links

| Task                         | Start here                                                   |
| ---------------------------- | ------------------------------------------------------------ |
| Onboard a new project        | `/setuplab <repo-url>` or [Setup Pipeline](./setup-pipeline) |
| Understand the agency system | [Agency Overview](./agency-overview)                         |
| See the system architecture  | [Agency Architecture](./agency-architecture)                 |
| Set up CI/CD for a project   | [CI/CD Setup](./ci-cd-setup)                                 |
| Build a new LangGraph flow   | [Flow Development Pattern](./flow-development-pattern)       |
