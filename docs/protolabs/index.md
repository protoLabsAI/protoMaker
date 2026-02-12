# ProtoLabs

ProtoLabs is Automaker's project onboarding and alignment system. It scans any repository, compares it against a defined quality standard, and proposes features to bring the project up to spec — all automated through the `/setuplab` command.

## How It Works

1. **Scan** — Detect tech stack, dependencies, project structure
2. **Analyze** — Compare against the quality standard (CI, testing, types, tooling)
3. **Initialize** — Set up `.automaker/` and context files
4. **Propose** — Create alignment features on the Kanban board
5. **Execute** — AI agents implement the alignment work

## Guides

- [Setup Pipeline](./setup-pipeline.md) — Technical reference for the 5-phase `/setuplab` pipeline
- [CI/CD Setup](./ci-cd-setup.md) — GitHub Actions and branch protection setup
