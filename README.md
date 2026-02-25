<p align="center">
  <img src="apps/ui/public/readme_logo.svg" alt="protoLabs Logo" height="80" />
</p>

<p align="center">
  <strong>Autonomous AI Development Studio</strong><br/>
  Describe features. Agents build them. PRs ship automatically.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://discord.gg/jjem7aEDKU"><img src="https://img.shields.io/discord/1284177428438274068?color=5865F2&label=Discord&logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg" alt="Code of Conduct" /></a>
  <a href="https://protolabs.studio"><img src="https://img.shields.io/badge/docs-protolabs.studio-brightgreen" alt="Docs" /></a>
</p>

---

**protoLabs** is the maintained successor of [Automaker](https://github.com/AutoMaker-Org/automaker). We picked it up, rebuilt it into a multi-agent orchestration studio, and ship real products with it every day.

You describe what you want built. AI agents implement it in isolated git branches, create PRs, and handle review feedback. You merge and ship.

![protoLabs UI](https://i.imgur.com/jdwKydM.png)

## Quick Start

```bash
git clone https://github.com/proto-labs-ai/protolabs-studio.git
cd protolabs-studio
npm install
npm run dev
```

Requires **Node.js 22+** and an authenticated [Claude Code CLI](https://code.claude.com/docs/en/quickstart).

## What It Does

- **Kanban board** --- Describe features, AI agents implement them autonomously
- **Git worktree isolation** --- Each feature builds in its own branch, main stays clean
- **Real-time streaming** --- Watch agents work, send follow-up instructions mid-flight
- **Auto-mode** --- Queue features, set dependencies, agents process the backlog
- **Agent teams** --- Named specialists (frontend, backend, DevOps) with domain-specific tools and context
- **Linear + Discord** --- Plan in Linear, collaborate in Discord, ship via GitHub
- **Claude Code plugin** --- 120+ MCP tools, slash commands, full CLI control

## How It Works

```
You create a feature --> Agent claims it --> Works in isolated branch --> Creates PR --> You review & merge
```

1. Add a feature to the board (or sync from Linear)
2. Auto-mode assigns an AI agent based on complexity
3. Agent works in a git worktree --- reads the codebase, implements the feature, runs verification
4. PR created with full diff, agent output, and CI checks
5. Merge and ship. Feature moves to done.

For complex work, protoLabs runs a full pipeline: idea -> research -> SPARC PRD -> human review -> milestones -> parallel agent execution.

## Claude Code Plugin

Control protoLabs from your terminal:

```bash
claude plugin marketplace add https://github.com/proto-labs-ai/protolabs-studio/tree/main/packages/mcp-server/plugins
claude plugin install automaker
```

```
/board              View and manage your Kanban board
/auto-mode          Start/stop autonomous feature processing
/orchestrate        Manage feature dependencies
/plan-project       Full project orchestration pipeline
```

[Full plugin docs](docs/integrations/claude-plugin.md)

## Documentation

Full docs at **[protolabs.studio](https://protolabs.studio)**:

- **[Getting Started](docs/getting-started/)** --- Installation, configuration, first feature
- **[Agent System](docs/agents/)** --- How agents work, creating teams, prompt engineering
- **[Self-Hosting](docs/infra/)** --- Docker, systemd, staging deployment, networking
- **[Integrations](docs/integrations/)** --- Linear, Discord, Claude Code plugin, MCP tools
- **[Development](docs/dev/)** --- Contributing, architecture, shared packages, testing

## Community

Join builders exploring agentic coding and autonomous development:

**[Discord](https://discord.gg/jjem7aEDKU)** · **[protolabs.studio](https://protolabs.studio)** · **[GitHub](https://github.com/proto-labs-ai)** · **[Code of Conduct](CODE_OF_CONDUCT.md)**

We're committed to providing a welcoming and inclusive community. Please review our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Security

This software uses AI agents that have access to your file system and can execute commands. We recommend running in Docker or a VM for isolation. See the [full disclaimer](docs/disclaimer.md).

## License

MIT --- see [LICENSE](LICENSE).

Originally forked from [Automaker](https://github.com/AutoMaker-Org/automaker) (MIT). We are the actively maintained successor.

---

<p align="center">
  Built by <a href="https://protolabs.studio">protoLabs</a> --- an AI-native development agency.
</p>
