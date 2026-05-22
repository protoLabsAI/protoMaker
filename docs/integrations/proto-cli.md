---
title: protoCLI
description: The namesake SDK and default agent runtime. Quickstart + reference live in the protoCLI repo.
---

# protoCLI

protoCLI is the namesake SDK and the default agent runtime for protoLabs Studio. Every new agent run routes through it; the Claude / Cursor / Codex / OpenCode CLI integrations remain available for users who prefer those tools but are no longer the primary path.

The agent in this app uses the **bundled SDK** (`@protolabsai/sdk`) so a standalone CLI install isn't required. Installing the standalone `proto` binary just lets you run protoCLI in any terminal outside the app.

## Quickstart

The protoCLI quickstart, command reference, skill catalog, and configuration docs live in the upstream repo. Start there:

- **Repo**: [github.com/protoLabsAI/protoCLI](https://github.com/protoLabsAI/protoCLI)
- **README** (quickstart + install + auth): [github.com/protoLabsAI/protoCLI#readme](https://github.com/protoLabsAI/protoCLI#readme)
- **TypeScript SDK** (`@protolabsai/sdk` — what this app embeds): [packages/sdk-typescript](https://github.com/protoLabsAI/protoCLI/tree/dev/packages/sdk-typescript)

## How protoLabs Studio uses it

|               |                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime path  | `@protolabsai/sdk` `query()` calls from the server's `ProtoProvider` (and from `ClaudeProvider` via the `@protolabsai/sdk/anthropic-compat` subpath) |
| Gateway       | All requests route through `https://api.proto-labs.ai/v1` by default. Override via `GATEWAY_BASE_URL` env.                                           |
| Auth          | `GATEWAY_API_KEY` env (preferred) or `OPENAI_API_KEY` env. Org-issued; no per-user login.                                                            |
| Default model | `protolabs/smart`                                                                                                                                    |

## In-app status

The app autodetects protoCLI install + gateway connectivity:

- **Settings → AI Providers → protoCLI** — connection status card with CLI version, env-var source, and gateway reachability
- **Setup wizard → Providers step** — protoCLI is the default-active first tab and runs the same status check on open

Both surfaces read from `GET /api/setup/proto-status` on the server.

## Where the rest of the docs live

This page intentionally avoids duplicating what's already in the protoCLI repo. For:

- **Install + login** — see the [protoCLI README](https://github.com/protoLabsAI/protoCLI#readme)
- **Available skills** (test-driven-development, systematic-debugging, sprint-contract, etc.) — see the [skills catalog in the repo](https://github.com/protoLabsAI/protoCLI/tree/dev/packages/cli/src/skills)
- **CLI commands** (`/help`, `/auth`, `/model`, `/skills`, `/memory`, `/voice`, `/team`, etc.) — `proto --help` after install
- **SDK API** (programmatic `query()`, `tool()`, MCP servers, hooks) — see [packages/sdk-typescript README](https://github.com/protoLabsAI/protoCLI/tree/dev/packages/sdk-typescript)
