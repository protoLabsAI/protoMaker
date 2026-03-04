<p align="center">
  <img src="apps/ui/public/readme_logo.svg" alt="protoLabs Logo" height="80" />
</p>

<p align="center">
  <strong>Autonomous AI Development Studio</strong><br/>
  Describe features. Agents build them. PRs ship automatically.
</p>

<p align="center">
  <a href="https://github.com/proto-labs-ai/protolabs-studio/actions/workflows/test.yml"><img src="https://github.com/proto-labs-ai/protolabs-studio/actions/workflows/test.yml/badge.svg" alt="Build Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <!-- Discord badge — update href and guild ID when protoLabs Discord is live -->
  <a href="#"><img src="https://img.shields.io/badge/Discord-TBA-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen" alt="Node Version" /></a>
  <a href="CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg" alt="Code of Conduct" /></a>
  <a href="https://protolabs.studio"><img src="https://img.shields.io/badge/docs-protolabs.studio-blue" alt="Docs" /></a>
</p>

> **Alpha Software** --- protoLabs Studio is under active development. Things break, APIs change, and rough edges are everywhere. If you're a hacker, thinker, or do-er who wants to shape the future of autonomous development, you're in the right place. If you want something more stable, check out [Automaker](https://github.com/AutoMaker-Org/automaker) --- the project we forked from.

---

**protoLabs** is the maintained successor of [Automaker](https://github.com/AutoMaker-Org/automaker). We picked it up, rebuilt it into a multi-agent orchestration studio, and ship real products with it every day.

You describe what you want built. AI agents implement it in isolated git branches, create PRs, and handle review feedback. You merge and ship.

![protoLabs UI](https://i.imgur.com/jdwKydM.png)

## Get Started

### Desktop App

<table>
<tr>
<td align="center"><strong>macOS</strong></td>
<td align="center"><strong>Windows</strong></td>
<td align="center"><strong>Linux</strong></td>
</tr>
<tr>
<td align="center">

[Download .dmg](https://github.com/proto-labs-ai/protolabs-studio/releases/latest/download/protoLabs-Studio-mac.dmg)<br/>
[Download .zip](https://github.com/proto-labs-ai/protolabs-studio/releases/latest/download/protoLabs-Studio-mac.zip)

</td>
<td align="center">

[Download .exe](https://github.com/proto-labs-ai/protolabs-studio/releases/latest/download/protoLabs-Studio-win.exe)

</td>
<td align="center">

[.AppImage](https://github.com/proto-labs-ai/protolabs-studio/releases/latest/download/protoLabs-Studio.AppImage) · [.deb](https://github.com/proto-labs-ai/protolabs-studio/releases/latest/download/protoLabs-Studio.deb) · [.rpm](https://github.com/proto-labs-ai/protolabs-studio/releases/latest/download/protoLabs-Studio.rpm)

</td>
</tr>
</table>

_Desktop releases coming soon. Run from source below to try now._

### Run from Source

```bash
git clone https://github.com/proto-labs-ai/protolabs-studio.git
cd protolabs-studio
npm install
npm run dev                 # Interactive launcher (choose web or electron)
npm run dev:full            # Web mode — starts UI (localhost:3007) AND server (localhost:3008)
npm run dev:electron        # Desktop app mode (bundles server automatically)
```

> **Note:** `npm run dev:web` starts only the UI frontend on port 3007. It requires a separate server instance running on port 3008. Use `npm run dev:full` (recommended) to start both together, or `npm run dev:server` in a second terminal.

Requires **Node.js 22+** and an authenticated [Claude Code CLI](https://code.claude.com/docs/en/quickstart).

## What It Does

### Kanban Board

Describe features in natural language. AI agents claim cards, implement the work, and ship PRs.

**Use Case**: "Add dark mode toggle to settings page" → Agent reads your theme system, implements the feature, adds tests, creates PR.

### Git Worktree Isolation

Each feature executes in its own git worktree. Main branch stays clean while agents work in parallel.

**Use Case**: 3 agents working simultaneously on different features without conflicts. Each creates a clean PR from their isolated branch.

### Real-Time Streaming

Watch agents think and work. Send follow-up instructions mid-flight like "also add TypeScript types" or "use Tailwind instead".

**Use Case**: Agent starts implementing a form → you see it's missing validation → send instruction → agent adjusts course without starting over.

### Auto-Mode

Queue features, set dependencies, let agents process the backlog. Complex projects break into milestones with parallel execution.

**Use Case**: Queue 10 features with dependencies (DB schema → API routes → frontend). Auto-mode executes in correct order, maximizing parallelism.

### Agent Teams

Named specialists (frontend, backend, DevOps, docs) with domain-specific tools, context files, and prompt engineering.

**Use Case**: Frontend agent knows React patterns, has access to component library docs. Backend agent knows your API conventions and database schema.

### Linear + Discord Integration

Plan in Linear, get notifications in Discord, review in GitHub. Full webhook integration keeps your tools in sync.

**Use Case**: Create Linear issue → auto-syncs to protoLabs board → agent implements → PR notification in Discord → merge → Linear issue auto-closes.

### Claude Code Plugin

120+ MCP tools for full control from Claude Code CLI. Manage boards, start agents, review status without leaving your terminal.

**Use Case**: `claude /board` shows features → `claude /auto-mode start` begins autonomous execution → `claude /orchestrate` manages dependencies.

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

## Why This Works

Autonomous agents sound dangerous. Unsupervised AI writing code, creating PRs, touching your codebase --- what could go wrong?

Everything, if you skip the discipline. protoLabs works because the guardrails are non-negotiable:

- **Context files define the rules.** Every project has `.automaker/context/` files that agents load before writing a single line. Your coding standards, architectural decisions, and conventions are injected into every agent session. Agents follow YOUR rules because you wrote them.
- **CodeRabbit reviews every PR.** Automated code review catches style violations, security issues, and logic errors before any human sees the diff. Agents that produce sloppy code get caught immediately.
- **CI runs on every push.** TypeScript checks, linting, formatting, tests --- nothing merges without passing the full pipeline. Broken code never reaches your main branch.
- **You review and merge.** Agents create PRs. They do not push to production. Every change goes through your normal review process. You have final say on what ships.

Trust is not the starting point --- it is earned. You set the standards. Agents follow them. Automated review catches drift. CI enforces correctness. And you hold the merge button.

The system stays aligned with your vision because you control every layer: the context files agents read, the review gates they pass through, and the branches they can touch.

## Claude Code Plugin

Control protoLabs from your terminal:

```bash
claude plugin marketplace add https://github.com/proto-labs-ai/protolabs-studio/tree/main/packages/mcp-server/plugins
claude plugin install protolabs
```

```
/board              View and manage your Kanban board
/auto-mode          Start/stop autonomous feature processing
/orchestrate        Manage feature dependencies
/plan-project       Full project orchestration pipeline
```

[Full plugin docs](docs/integrations/claude-plugin.md)

## Architecture

protoLabs Studio is a TypeScript monorepo with a React frontend and Express backend:

```
protolabs-studio/
├── apps/
│   ├── ui/              # React + Vite + Electron (port 3007)
│   └── server/          # Express + WebSocket backend (port 3008)
├── libs/                # 13 shared packages (@protolabs-ai/*)
│   ├── types/           # Core TypeScript definitions
│   ├── utils/           # Logging, errors, image processing
│   ├── git-utils/       # Git operations & worktree management
│   ├── observability/   # Langfuse tracing & prompt management
│   ├── tools/           # Unified tool definition & registry
│   ├── flows/           # LangGraph state graph primitives
│   └── ...              # [6 more packages]
├── packages/
│   ├── mcp-server/      # Claude Code plugin (120+ MCP tools)
│   └── create-protolab/ # Project scaffolding
└── site/                # Landing page (protolabs.studio)
```

**Key Technologies**:

- **Frontend**: React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4
- **Backend**: Express 5, WebSocket (ws), Claude Agent SDK, node-pty
- **AI**: Claude Sonnet 4.6/Opus 4.6, multi-provider support (OpenAI, Anthropic, Gemini)
- **Git**: Worktree-based isolation, GitHub API integration
- **Observability**: Langfuse tracing, structured logging, cost tracking
- **Testing**: Playwright (E2E), Vitest (unit)

**Package Dependency Chain**:

```
@protolabs-ai/types (no dependencies)
    ↓
@protolabs-ai/utils, prompts, platform, model-resolver, dependency-resolver,
spec-parser, pen-parser, tools, flows, observability
    ↓
@protolabs-ai/git-utils, ui
    ↓
apps/server, apps/ui
```

[Full Architecture Documentation](https://protolabs.studio/docs/architecture)

## Documentation

Full docs at **[protolabs.studio](https://protolabs.studio)**:

- **[Getting Started](docs/getting-started/)** --- Installation, configuration, first feature
- **[Agent System](docs/agents/)** --- How agents work, creating teams, prompt engineering
- **[Self-Hosting](docs/infra/)** --- Docker, systemd, staging deployment, networking
- **[Integrations](docs/integrations/)** --- Linear, Discord, Claude Code plugin, MCP tools
- **[Development](docs/dev/)** --- Contributing, architecture, shared packages, testing

## Community

Join builders exploring agentic coding and autonomous development:

**Discord (TBA)** · **[protolabs.studio](https://protolabs.studio)** · **[GitHub](https://github.com/proto-labs-ai)** · **[Code of Conduct](CODE_OF_CONDUCT.md)**

We're committed to providing a welcoming and inclusive community. Please review our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Contributing

protoMaker uses an **ideas-only contribution model** — AI agents implement all code. We don't accept code PRs from the community.

- **Submit an idea**: [Idea Submission template](https://github.com/proto-labs-ai/protoMaker/issues/new?template=idea_submission.yml)
- **Report a bug**: [Bug Report template](https://github.com/proto-labs-ai/protoMaker/issues/new?template=bug_report.yml)
- **Join the discussion**: Discord (invite link TBA)

[Full Contributing Guidelines](CONTRIBUTING.md)

## Security

This software uses AI agents that have access to your file system and can execute commands. We recommend running in Docker or a VM for isolation. See the [full disclaimer](docs/disclaimer.md).

## License

MIT --- see [LICENSE](LICENSE).

Originally forked from [Automaker](https://github.com/AutoMaker-Org/automaker) (MIT). We are the actively maintained successor.

---

<p align="center">
  Built by <a href="https://protolabs.studio">protoLabs</a> --- an AI-native development agency.
</p>
