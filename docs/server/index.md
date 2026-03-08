# Server Reference

Technical reference for the protoLabs backend (`apps/server/`).

## Architecture

The server is an Express 5 application with WebSocket streaming, organized into routes, services, and providers.

## Reference

- **[Route Organization](./route-organization)** — Express route structure, middleware, and patterns
- **[Providers](./providers)** — AI provider abstraction (Claude, Cursor, Codex, OpenCode)
- **[Utilities](./utilities)** — Server utility functions and helpers
- **[Automations](./automation-registry)** — Scheduled tasks, custom flows, run history, and the unified control plane
- **[Calendar API](./calendar-api)** — Calendar events, Google Calendar sync, and MCP tools
- **[Knowledge Store](./knowledge-store)** — SQLite FTS5 knowledge base for agent context retrieval
- **[Ava Channel](./ava-channel)** — Multi-instance Ava coordination channel, CRDT-backed message store, and System Improvements auto-filing
- **[DORA Metrics](./dora-metrics)** — Team health monitoring via feature-based proxy metrics (lead time, deployment frequency, change failure rate, recovery time, rework rate)

## Key Technologies

- **Express 5** — HTTP routing and middleware
- **ws** — WebSocket server for real-time event streaming
- **Claude Agent SDK** — AI agent execution
- **node-pty** — Terminal emulation for agent shell access
