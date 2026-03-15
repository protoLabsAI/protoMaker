# PRD: AI Agent App Starter Kit

**Author**: SPARC PRD Agent
**Date**: 2026-03-14
**Status**: Draft
**Version**: 1.0

## Executive Summary

This PRD defines the extraction, packaging, and scaffold-system integration of an "AI Agent App" starter kit for protoLabs Studio. The starter kit distills protoLabs Studio's mature AI chat system into a clean, dependency-free monorepo template that users scaffold via `npx create-protolab my-app --kit ai-agent-app`, giving them a working multi-package chat application with streaming, tool invocations, HITL confirmation, extended reasoning, slash commands, and multi-model support — all in under 5 minutes.

---

## 1. Specification

### 1.1 Problem Statement

protoLabs Studio has built a production-quality AI chat system across several packages (`libs/ui/src/ai/`, server chat routes, model resolver, slash commands, session state). These components are tightly coupled to the automaker board, its tool cards, and internal `@protolabsai/*` utilities. Developers starting a new AI-native application have no clean starting point: they must either wire up Vercel AI SDK streaming from scratch or copy-paste from the automaker source and manually strip automaker-specific code.

The scaffold system already supports docs, portfolio, landing-page, and browser-extension starter kits. There is no AI/backend kit. This gap means the `ai` category in `apps/ui/src/lib/templates.ts` is empty and users who want to build agent-powered applications receive no accelerator.

### 1.2 Target Users

- **Developers building AI-native applications** who want streaming chat + agent tools without implementing the protocol layer themselves.
- **protoLabs Studio users** creating a new project who select a starter kit from the board's new-project wizard and choose the AI Agent App template.
- **AI engineers** who want a production-quality foundation: extended reasoning display, HITL confirmation, multi-provider routing, and custom tool card registration — already wired in.

### 1.3 Success Criteria

- [ ] `npx create-protolab my-ai-app --kit ai-agent-app` scaffolds a working monorepo with no post-scaffold configuration required beyond setting `ANTHROPIC_API_KEY`.
- [ ] User can send a message and receive a streaming response within 5 minutes of scaffold.
- [ ] User can define a custom tool in `packages/server/src/tools/` and register a matching renderer in `packages/ui/src/tool-results/` with fewer than 30 lines of new code.
- [ ] Changing 6 CSS custom property values in `packages/app/src/styles/tokens.css` rebrands the entire application.
- [ ] Switching from Anthropic to OpenAI requires only changing `PROVIDER` and `MODEL` in `packages/server/.env`.
- [ ] Extended reasoning renders inline as a collapsible ChainOfThought component when the model emits reasoning tokens.
- [ ] A tool call marked with `requiresConfirmation: true` displays a ConfirmationCard inline in the message stream (not a dialog).
- [ ] Chat sessions persist across browser refreshes via Zustand + localStorage.
- [ ] All TypeScript, linting, and build checks pass on the scaffolded output: `npm run build` exits 0.
- [ ] The kit appears as a selectable template in the protoLabs Studio new-project wizard under the `ai` category.

### 1.4 Non-Goals

- **Not a framework.** The scaffolded code is owned by the user immediately. There is no upstream dependency to keep in sync.
- **Not a SaaS template.** No authentication, payments, user management, or database. Those belong to a separate `ai-saas-app` kit.
- **Not automaker.** No board, no worktrees, no auto-mode, no feature management, no MCP server.
- **Not opinionated about hosting.** The SPA deploys anywhere (Vercel, Cloudflare Pages, Netlify, S3). The Express server deploys anywhere (Fly.io, Railway, EC2). No platform-specific adapters are included.
- **Not a Next.js or Astro project.** The architecture decision (Vite SPA + Express) is locked. SSR/SSG options are out of scope.
- **Not a pnpm or yarn project.** npm workspaces only.
- **No auth provider integration.** Adding Clerk, Auth0, or similar is a first-class post-scaffold task, not a pre-installed dependency.

### 1.5 Assumptions and Constraints

- Vercel AI SDK v4+ is the streaming protocol layer. The `UIMessage` type, `useChat` hook, `streamText`, and `createUIMessageStream` / `pipeUIMessageStreamToResponse` are the canonical APIs.
- React 19 patterns exclusively: `ref` as prop (no `forwardRef`), `use()` for context, `function` declarations with explicit props, named exports only, no `React.FC`, no class components, no HOCs.
- npm workspaces (not pnpm, not yarn) because that is the monorepo toolchain used throughout the automaker repo.
- The `@protolabsai/utils` `formatDuration` import in `chain-of-thought.tsx` must be inlined before extraction (it is the only cross-package dependency to sever).
- The 30+ automaker-specific tool card registrations in `tool-invocation-part.tsx` must be stripped from the extracted component; the file must ship with zero registrations.
- The starter kit's `packages/ui` is a standalone npm package inside the monorepo, not a dependency on `@protolabsai/ui`. Users own all the code.
- The scaffold route must accept `kitType: 'ai-agent-app'` before any of the five scaffold milestones are merged; adding this guard first prevents broken state in the route handler.
- CI for the scaffolded project is out of scope for Milestone 1; it is Milestone 5 work.

---

## 2. Planning

### 2.1 Solution Overview

The work is divided across two concerns:

1. **Extraction and template authoring** — strip automaker-specific coupling from `libs/ui/src/ai/`, author the three-package monorepo template under `libs/templates/starters/ai-agent-app/`, and write the scaffold function in `libs/templates/src/scaffold.ts`.
2. **System integration** — wire the new kit type into the five integration points: `types.ts`, `features.ts`, `scaffold.ts`, `scaffold-starter.ts` (server route), and `templates.ts` (UI). These touch existing files and must follow the greenfield-first rule: update all consumers immediately, no compat shims.

The extraction work is the majority of the effort. The system integration is mechanical and parallelisable with extraction in later milestones.

### 2.2 Component Breakdown

#### Template Package: `libs/templates/starters/ai-agent-app/`

```
ai-agent-app/
├── packages/
│   ├── ui/                   # @scope/ui — chat component library
│   │   ├── src/
│   │   │   ├── components/   # 25 chat components (extracted + cleaned)
│   │   │   ├── lib/utils.ts  # cn() = clsx + tailwind-merge
│   │   │   └── index.ts      # named re-exports
│   │   ├── package.json      # name: "@@PROJECT_NAME/ui", deps: react, ai, lucide-react, cva
│   │   └── tsconfig.json
│   ├── server/               # @scope/server — Express AI streaming backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   └── chat.ts   # POST /api/chat — streamText + createUIMessageStream
│   │   │   ├── tools/
│   │   │   │   ├── registry.ts    # ToolDefinition interface + register/list functions
│   │   │   │   └── example.ts     # "get_weather" example tool with requiresConfirmation
│   │   │   ├── commands/
│   │   │   │   ├── registry.ts    # SlashCommand interface + register/list functions
│   │   │   │   └── example.ts     # /summarize example command
│   │   │   ├── roles/
│   │   │   │   └── index.ts       # AgentRole interface + default assistant role
│   │   │   ├── model-resolver.ts  # Simplified multi-provider resolver (Anthropic, OpenAI, Google)
│   │   │   └── index.ts           # Express app factory
│   │   ├── package.json      # name: "@@PROJECT_NAME/server", deps: express, ai, @ai-sdk/*
│   │   └── tsconfig.json
│   └── app/                  # @scope/app — Vite + React 19 SPA
│       ├── src/
│       │   ├── routes/
│       │   │   ├── __root.tsx     # TanStack Router root layout
│   │   │   ├── index.tsx      # / — chat view
│   │   │   ├── sessions.tsx   # /sessions — session list
│   │   │   └── settings.tsx   # /settings — model + theme config
│       │   ├── hooks/
│       │   │   └── use-chat-session.ts  # AI SDK useChat + Zustand coordination
│       │   ├── store/
│       │   │   └── session-store.ts     # Zustand persistent sessions (localStorage)
│       │   ├── styles/
│       │   │   └── tokens.css           # 6-value CSS custom property theming system
│       │   └── main.tsx
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json      # name: "@@PROJECT_NAME/app", deps: react, @tanstack/*, zustand
│       └── tsconfig.json
├── package.json              # npm workspaces root, name: "@@PROJECT_NAME"
└── README.md                 # Quick-start, env vars, tool registration guide
```

#### Integration Points in Existing Codebase

| File                                                      | Change                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `libs/templates/src/types.ts`                             | Add `'ai-agent-app'` to `StarterKitType` union                                                          |
| `libs/templates/src/scaffold.ts`                          | Add `scaffoldAiAgentAppStarter()` function, add `resolveStarterDir` to handle `'ai-agent-app'`          |
| `libs/templates/src/features.ts`                          | Add `AI_AGENT_APP_FEATURES` constant and `'ai-agent-app'` case in `getStarterFeatures()`                |
| `libs/templates/src/index.ts`                             | Export `scaffoldAiAgentAppStarter`                                                                      |
| `apps/server/src/routes/setup/routes/scaffold-starter.ts` | Add `'ai-agent-app'` to the `kitType` union, add `scaffoldAiAgentAppStarter` import and handler mapping |
| `apps/ui/src/lib/templates.ts`                            | Add `'ai-agent-app'` to `StarterTemplate['kitType']` union, add entry to `starterTemplates` array       |
| `libs/templates/src/starters.ts`                          | Add `getAiAgentAppStarterContext()` function                                                            |

### 2.3 Implementation Phases

The milestones below correspond to the phases described in the request. Each phase has explicit completion gates before the next begins.

**Phase 1 — Foundation (extraction + monorepo skeleton)**
Depends on: nothing
Gate: `npm run build:packages` passes; starter directory exists at `libs/templates/starters/ai-agent-app/`; scaffold function copies files without error.

**Phase 2 — Server + Streaming**
Depends on: Phase 1 directory structure
Gate: `npm install && npm run dev` in the scaffolded output starts Express on port 3001; `curl -X POST http://localhost:3001/api/chat -d '{"messages":[{"role":"user","content":"hello"}]}'` returns a streaming response with `data:` prefixed lines.

**Phase 3 — App + State**
Depends on: Phase 2 (server must be running for E2E integration check)
Gate: Vite dev server starts; chat UI renders; sending a message produces streaming text in the bubble; session survives `localStorage.clear()` followed by page reload (Zustand rehydration).

**Phase 4 — Advanced Features**
Depends on: Phase 3
Gate: `/summarize hello world` slash command expands; ChainOfThought renders when the model emits reasoning tokens (tested with a mock that injects a reasoning part); ConfirmationCard appears inline (not as a dialog) when `get_weather` tool is called; tool result registry accepts a custom renderer via `toolResultRegistry.register()`.

**Phase 5 — Polish + Integration**
Depends on: Phase 4
Gate: All five integration points updated; `npm run build:packages` passes; scaffold route accepts `'ai-agent-app'`; UI template picker shows the new card; `npm run test:server` passes; `npm run typecheck` passes.

---

## 3. Architecture

### 3.1 System Design

```
create-protolab CLI
  └── calls POST /api/setup/scaffold-starter { kitType: 'ai-agent-app' }
        └── scaffoldAiAgentAppStarter()
              └── copyDir(starters/ai-agent-app → outputDir)
                    └── applyMonorepoSubstitutions()  ← patches all package.json "name" fields
                          └── writeContextFile()       ← .automaker/CONTEXT.md for agent guidance

Scaffolded project runtime:

Browser (packages/app, port 5173)
  └── TanStack Router SPA
        └── useChat (Vercel AI SDK)
              └── POST /api/chat → packages/server (port 3001)
                    └── streamText()
                          └── AI SDK provider (Anthropic | OpenAI | Google)
                                └── tool definitions registered in tools/registry.ts

Browser ←── WebSocket ws://localhost:3001/ws
              └── tool progress events (optional sideband)
```

The SPA and server are separate processes in development. In production, the Express server can serve the built SPA as static files — a one-file deployment path is documented in README.md.

### 3.2 Data Models

#### UIMessage (Vercel AI SDK v4 — do not redefine, import from `ai`)

```typescript
import type { UIMessage } from 'ai';
// UIMessage is the canonical message type throughout the template.
// Do not define a local Message type. Do not use CoreMessage in the UI layer.
```

#### Session

```typescript
// packages/app/src/store/session-store.ts
export interface ChatSession {
  id: string; // crypto.randomUUID()
  title: string; // Auto-set from first user message (first 60 chars)
  messages: UIMessage[];
  model: string; // Resolved model ID, e.g. "claude-sonnet-4-6"
  createdAt: number; // Date.now()
  updatedAt: number;
}

export interface SessionStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  // Actions
  createSession: (model?: string) => ChatSession;
  activateSession: (id: string) => void;
  updateMessages: (id: string, messages: UIMessage[]) => void;
  deleteSession: (id: string) => void;
  setTitle: (id: string, title: string) => void;
}
// Max 50 sessions. When limit is exceeded, oldest (by updatedAt) is evicted.
// Persisted via zustand/middleware persist to localStorage key "ai-agent-app-sessions".
```

#### Tool Definition

```typescript
// packages/server/src/tools/registry.ts
export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  parameters: import('zod').ZodSchema<TInput>;
  execute: (input: TInput) => Promise<TOutput>;
  /**
   * When true, the client will render a ConfirmationCard before allowing
   * the tool to execute. The server must check the approval state in the
   * AI SDK tool call handler.
   */
  requiresConfirmation?: boolean;
}
```

#### Slash Command

```typescript
// packages/server/src/commands/registry.ts
export interface SlashCommand {
  name: string; // e.g. "summarize" (without slash)
  description: string; // Shown in dropdown
  /**
   * Returns a system prompt fragment to prepend for this invocation.
   * Receives everything after the command name as `args`.
   */
  expand: (args: string) => string;
}
```

#### Agent Role

```typescript
// packages/server/src/roles/index.ts
export interface AgentRole {
  id: string;
  name: string;
  systemPrompt: string;
  /** Default model alias for this role, e.g. "claude-sonnet" */
  defaultModel?: string;
}
```

#### Model Resolver (simplified, multi-provider)

```typescript
// packages/server/src/model-resolver.ts
export type ProviderName = 'anthropic' | 'openai' | 'google';

export interface ResolvedModel {
  provider: ProviderName;
  modelId: string; // Full provider model ID
  sdkProvider: LanguageModelV1; // AI SDK provider instance
}

// Supported aliases:
// Anthropic: 'haiku' → 'claude-haiku-4-5-20251001'
//            'sonnet' → 'claude-sonnet-4-6'
//            'opus'   → 'claude-opus-4-6'
// OpenAI:    'gpt-4o' → 'gpt-4o' (pass-through)
//            'gpt-4o-mini' → 'gpt-4o-mini'
// Google:    'gemini-2.0-flash' → 'gemini-2.0-flash' (pass-through)
export function resolveModel(alias: string): ResolvedModel;
```

### 3.3 API Contracts

#### POST /api/chat

Request body (JSON):

```typescript
interface ChatRequest {
  messages: UIMessage[];
  model?: string; // Model alias, defaults to env.DEFAULT_MODEL
  role?: string; // Agent role ID, defaults to 'assistant'
  sessionId?: string; // For server-side logging/tracing only
}
```

Response: `text/event-stream` using Vercel AI SDK `pipeUIMessageStreamToResponse()`. The client uses `useChat` from `ai/react` — no custom stream parsing required.

#### GET /ws

WebSocket endpoint for tool progress events. Message format:

```typescript
interface ToolProgressEvent {
  type: 'tool:progress';
  toolCallId: string;
  toolName: string;
  progress: number; // 0–100
  message?: string;
}
```

The WebSocket sideband is optional. If the client does not connect, tool calls still complete; progress events are simply not shown.

#### GET /api/health

Returns `{ status: 'ok', timestamp: number }`. Used by the Vite proxy health check.

### 3.4 Integration Points

**`libs/templates/src/types.ts`**
`StarterKitType` union must become:

```typescript
export type StarterKitType =
  | 'docs'
  | 'portfolio'
  | 'landing-page'
  | 'extension'
  | 'general'
  | 'ai-agent-app';
```

**`libs/templates/src/scaffold.ts`**
`resolveStarterDir` parameter type must be updated to accept `'ai-agent-app'`. A new exported async function `scaffoldAiAgentAppStarter` follows the same pattern as `scaffoldDocsStarter` but calls `applyMonorepoSubstitutions` (a new private helper) instead of `applySubstitutions`, because the monorepo has multiple `package.json` files to patch (root + three packages).

`applyMonorepoSubstitutions` must:

1. Patch the root `package.json` `name` field.
2. Patch `packages/ui/package.json`, `packages/server/package.json`, and `packages/app/package.json` — replacing the `@@PROJECT_NAME` token in the `name` field and in workspace `dependencies` references.
3. Patch `packages/app/src/styles/tokens.css` — replace `@@PROJECT_NAME` comment token with the actual name.

**`apps/server/src/routes/setup/routes/scaffold-starter.ts`**
The `kitType` validation array literal and the `scaffolders` map must both accept `'ai-agent-app'`. The import must include `scaffoldAiAgentAppStarter`.

**`apps/ui/src/lib/templates.ts`**
`StarterTemplate['kitType']` must add `'ai-agent-app'`. A new entry in `starterTemplates` with:

```typescript
{
  id: 'ai-agent-app',
  name: 'AI Agent App',
  description: 'Streaming chat + AI agent tools in a 3-package monorepo...',
  source: 'scaffold',
  kitType: 'ai-agent-app',
  techStack: ['React 19', 'Vite 7', 'Express', 'Vercel AI SDK 4', 'Tailwind CSS 4', 'Zustand 5', 'TanStack Router'],
  features: [...],
  category: 'ai',
  author: 'protoLabs',
}
```

---

## 4. Review Criteria

### 4.1 Acceptance Criteria

**REQ-01: Scaffold produces a buildable monorepo**
Given `scaffoldAiAgentAppStarter({ projectName: 'test-ai-app', outputDir: '/tmp/test-ai-app' })` is called, the output directory contains a valid npm workspace structure. Running `npm install && npm run build` from `/tmp/test-ai-app` exits 0 with no TypeScript errors.

**REQ-02: Streaming response works out of the box**
Given `ANTHROPIC_API_KEY` is set and `npm run dev` is running, sending `POST /api/chat` with `{ messages: [{ role: 'user', content: 'ping' }] }` returns a response with `Content-Type: text/event-stream` and at least one `data:` line containing a text delta within 10 seconds.

**REQ-03: Project name substitution is complete**
After scaffolding with `projectName: 'my-cool-app'`, no occurrence of `@@PROJECT_NAME` remains in any file in the output directory. Running `grep -r '@@PROJECT_NAME' /tmp/test-ai-app` returns no results.

**REQ-04: ToolResultRegistry is empty at startup**
The exported `toolResultRegistry` singleton in `packages/ui/src/tool-result-registry.ts` has 0 registered renderers after import. No registrations occur at module load time. Users register their own renderers by calling `toolResultRegistry.register()` in their application entry point.

**REQ-05: ConfirmationCard renders inline**
Given a tool definition with `requiresConfirmation: true` is invoked during a chat, the `ToolInvocationPart` component renders a `ConfirmationCard` in the message stream — not a modal dialog, not a toast — before the tool executes. Approving calls the tool. Rejecting marks the invocation `output-denied`.

**REQ-06: Multi-provider switching**
Setting `PROVIDER=openai` and `MODEL=gpt-4o` in `packages/server/.env` and restarting the server routes all chat requests through the OpenAI AI SDK provider. No code changes are required. The same applies for `PROVIDER=google MODEL=gemini-2.0-flash`.

**REQ-07: ChainOfThought renders reasoning tokens**
When the model emits a reasoning part (`type: 'reasoning'` in UIMessage parts), the `ChatMessage` component renders a `ChainOfThought` component above the text bubble. It defaults to collapsed. Expanding it shows the parsed reasoning steps. "Thought for Xs" duration label appears when the reasoning state transitions to `done`.

**REQ-08: Session persistence**
A session created in the browser survives a hard page reload. Zustand's `persist` middleware writes to `localStorage`. On rehydration, `activeSessionId` is restored and the previous messages are displayed.

**REQ-09: Slash command expansion**
Typing `/summarize my notes` in the chat input and pressing Enter sends a message where the server has expanded the command: the system prompt for that turn includes the expansion fragment returned by the `summarize` command's `expand()` function.

**REQ-10: Template visible in UI picker**
In protoLabs Studio, navigating to the new-project wizard shows the "AI Agent App" template card in the `ai` category with correct tech stack badges and feature list.

### 4.2 Test Requirements

**Unit tests (Vitest, `npm run test:server`)**

- `packages/server/src/model-resolver.ts`: Test alias resolution for all three providers. Test unknown alias passes through unchanged. Test `undefined` input returns default.
- `packages/server/src/tools/registry.ts`: Test `register`, `list`, and `execute` round-trips. Test that a tool with `requiresConfirmation: true` surfaces that flag.
- `packages/server/src/commands/registry.ts`: Test `register` and `expand` with args. Test unknown command returns `null`.
- `libs/templates/src/scaffold.ts` → `scaffoldAiAgentAppStarter`: Test that output directory contains expected top-level entries. Test that `@@PROJECT_NAME` token is absent after scaffold. Test that `projectName` appears in root `package.json`.

**Integration tests**

- `POST /api/chat` with mock AI SDK provider returns `text/event-stream` and at least one delta. Uses `AUTOMAKER_MOCK_AGENT=true` equivalent: set `AI_MOCK=true` in test env to swap the provider for a deterministic streaming mock.
- Tool with `requiresConfirmation: true` sets invocation state to `approval-requested` before executing.
- WebSocket `/ws` emits `tool:progress` events when a registered tool emits progress callbacks.

**E2E tests (Playwright, opt-in)**

E2E tests for the scaffolded output are out of scope for this PRD. The starter kit ships with a documented Playwright setup guide in README.md so users can add their own.

### 4.3 Edge Cases

| Case                                                                                              | Expected Behavior                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outputDir` already exists and is non-empty                                                       | `scaffoldAiAgentAppStarter` returns `{ success: false, error: 'Directory is not empty' }`                                                         |
| `projectName` contains characters invalid in npm package names (spaces, uppercase, special chars) | `applyMonorepoSubstitutions` normalises to lowercase kebab-case before writing `package.json` name fields                                         |
| Model alias not in the resolver map (e.g. `'llama-3'`)                                            | `resolveModel` passes through the string unchanged and attempts the Anthropic provider as default; logs a warning                                 |
| Slash command name collision (two commands registered with same name)                             | Second registration overwrites first; logs a warning                                                                                              |
| Tool `execute` throws                                                                             | AI SDK catches the rejection and streams an `output-error` state; `ToolInvocationPart` renders the error badge                                    |
| Reasoning part arrives but text content is empty                                                  | `ChainOfThought` renders with `state: 'streaming'` spinner; no crash                                                                              |
| Session store exceeds 50 sessions                                                                 | Oldest session (by `updatedAt`) is evicted before inserting the new one                                                                           |
| User closes browser mid-stream                                                                    | `useChat`'s `AbortController` aborts the fetch; no dangling server-side processes because `streamText` respects the request abort signal          |
| `ANTHROPIC_API_KEY` not set                                                                       | Server starts but `/api/health` returns `{ status: 'ok' }`. First `/api/chat` request returns `{ error: 'API key not configured' }` with HTTP 500 |

### 4.4 Performance Requirements

| Metric                       | Requirement                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Time to first token (TTFT)   | <2s p95 for requests to Anthropic claude-haiku on a standard broadband connection                                      |
| Chat input keystroke latency | Textarea input must not lag; auto-resize recalculates on each `input` event without debounce                           |
| Session store hydration      | Zustand rehydration from localStorage completes before first render paint (synchronous read)                           |
| Bundle size — `packages/app` | Production build < 500 KB gzipped (excludes vendor chunks; Vite code-splits by route)                                  |
| `packages/ui` tree-shaking   | Each component is a named export with no side-effect imports at module level. Bundlers can eliminate unused components |
| WebSocket reconnect          | If the WebSocket connection drops, the client reconnects with exponential backoff: 1s, 2s, 4s, cap 30s                 |

---

## 5. Completion Checklist

### 5.1 Deliverables

**Template files**

- [ ] `libs/templates/starters/ai-agent-app/package.json` (workspace root)
- [ ] `libs/templates/starters/ai-agent-app/packages/ui/` (25 extracted components)
- [ ] `libs/templates/starters/ai-agent-app/packages/server/` (Express app + chat route + tool registry + command registry + model resolver)
- [ ] `libs/templates/starters/ai-agent-app/packages/app/` (Vite SPA + Zustand store + TanStack Router routes + theming)
- [ ] `libs/templates/starters/ai-agent-app/README.md`

**Library changes (existing files)**

- [ ] `libs/templates/src/types.ts` — `StarterKitType` updated
- [ ] `libs/templates/src/scaffold.ts` — `scaffoldAiAgentAppStarter` added, `resolveStarterDir` extended, `applyMonorepoSubstitutions` added
- [ ] `libs/templates/src/features.ts` — `AI_AGENT_APP_FEATURES` + switch case added
- [ ] `libs/templates/src/starters.ts` — `getAiAgentAppStarterContext` added
- [ ] `libs/templates/src/index.ts` — `scaffoldAiAgentAppStarter` exported

**Server route changes**

- [ ] `apps/server/src/routes/setup/routes/scaffold-starter.ts` — `'ai-agent-app'` accepted

**UI changes**

- [ ] `apps/ui/src/lib/templates.ts` — template entry added in `ai` category

**Tests**

- [ ] Unit tests for `model-resolver`, `tool-registry`, `command-registry`, `scaffoldAiAgentAppStarter`
- [ ] Integration test for `POST /api/chat` mock streaming
- [ ] Integration test for HITL approval state machine

### 5.2 Documentation

- [ ] `libs/templates/starters/ai-agent-app/README.md` — covers: prerequisites, quick start, environment variables table, adding a custom tool (step-by-step), registering a tool card renderer, switching AI providers, theming in 6 values, session management, slash command creation, agent role definition, production deployment (static SPA + API separately, or monolith with Express serving dist/)
- [ ] `docs/internal/ai-agent-app-starter.md` — architecture notes, extraction decisions, what was stripped from automaker, future kit ideas

The starter kit README follows the protoLabs Documentation Design rules: outcome-focused headings, code before prose, one idea per sentence, no emojis, no marketing language.

### 5.3 Rollout Plan

1. **Milestone 1** merges to `dev` via normal feature PR. The new starter directory is present but the integration points (`scaffold-starter.ts`, `templates.ts`) are not yet updated — the kit is not selectable in the UI yet.
2. **Milestones 2–4** merge to `dev` incrementally. Each PR targets `dev`. Starter content evolves in place.
3. **Milestone 5** is the integration PR. It updates all five integration points simultaneously. This is the PR that makes the kit selectable in the UI. After Milestone 5 merges to `dev`, the feature is in a promotable state.
4. **Staging promotion** follows the normal `dev → staging → main` flow. No data migration required; the scaffold system is additive.
5. **No migration steps** — existing projects are unaffected. The new `StarterKitType` union value is additive. The route handler's validation array is additive.

### 5.4 Monitoring

The scaffolded starter kit is an output artifact, not a running service. Observability requirements apply to the scaffold route within protoLabs Studio:

- **Scaffold route logging**: `apps/server/src/routes/setup/routes/scaffold-starter.ts` already logs `kitType` and `projectPath` via `createLogger('setup:scaffold-starter')`. No additional instrumentation required.
- **Error tracking**: Scaffold failures return `{ success: false, error: string }` and log via the server logger. No Langfuse tracing is needed for scaffold operations.
- **Kit adoption signal**: Count of `kitType: 'ai-agent-app'` in server logs provides a proxy metric for adoption until a formal analytics pipeline is in place.

Within the **scaffolded application**, the README documents how users can add Langfuse tracing to their AI calls using the `@langfuse/vercel-ai-sdk` package — this is a user-side concern, not a template-side requirement.

---

## Appendix

### A. Extraction Decision Record

**Why not reuse `@protolabsai/ui` as a dependency in the template?**
The template must be self-contained: users own 100% of the code after scaffolding and should not have a runtime dependency on an `@protolabsai/*` package that may change or be renamed. Extraction is the correct approach.

**What gets stripped from `tool-invocation-part.tsx`?**
Lines 17–44 (the 30 automaker-specific import statements) and lines 46–105 (all `toolResultRegistry.register()` calls for automaker tools). The remaining component logic — state machine rendering, collapse/expand, input/output display, JSON fallback — is kept verbatim. The `ConfirmationCard` import is retained because it is part of the HITL pattern.

**What gets inlined from `@protolabsai/utils`?**
One function: `formatDuration(ms: number): string` from `format-time.ts`. The implementation is 8 lines. It is inlined directly into `chain-of-thought.tsx` in the extracted template.

**Why TanStack Router and not React Router?**
TanStack Router provides TypeScript-first file-based routing with full type inference for route params and search params. It is already used in `apps/ui/` and is the protoLabs-standard router. Consistency reduces cognitive overhead for users who also work in the automaker codebase.

**Why Zustand and not Redux or React Context?**
Zustand 5 with `persist` middleware provides the simplest path to localStorage-backed multi-session state. It is already used in `apps/ui/src/store/`. No boilerplate, no provider nesting.

**Why WebSocket sideband for tool progress and not SSE?**
The main `/api/chat` stream is already SSE via `pipeUIMessageStreamToResponse`. Tool progress events are out-of-band from the message stream (they update UI state without adding new message parts). WebSocket is the right transport for this push channel. The sideband is opt-in: if the user removes the WebSocket server, tools still work.

### B. CSS Theming System

The 6 custom properties that control the entire brand:

```css
/* packages/app/src/styles/tokens.css */
:root {
  --color-surface-0: 0 0% 3.9%; /* Page background */
  --color-surface-1: 0 0% 7.1%; /* Card background */
  --color-surface-2: 0 0% 11%; /* Input background */
  --color-surface-3: 0 0% 14.9%; /* Hover / selected state */
  --color-accent: 262.1 83.3% 57.8%; /* Brand accent (purple default) */
  --color-accent-dim: 262.1 83.3% 47%; /* Darker accent for active states */
}
```

All Tailwind utility classes reference these tokens via CSS variable resolution. Changing these 6 values rebrands the application.

### C. Starter Features (for Board)

The following features are pre-loaded into the board backlog when the `ai-agent-app` kit is used:

```
AI_AGENT_APP_FEATURES = [
  {
    title: 'Add a custom tool with a rich result card',
    description: 'Define a new tool in packages/server/src/tools/ and register a matching renderer in packages/ui/src/tool-results/ using toolResultRegistry.register(). The example weather tool shows the pattern.',
    complexity: 'medium',
  },
  {
    title: 'Add an agent persona / role',
    description: 'Create a new AgentRole in packages/server/src/roles/ with a custom system prompt and default model. Wire it to a UI selector on the /settings route.',
    complexity: 'small',
  },
  {
    title: 'Add a slash command',
    description: 'Register a new SlashCommand in packages/server/src/commands/. Update the SlashCommandDropdown in packages/ui to surface the description. Test with /yourcommand args.',
    complexity: 'small',
  },
  {
    title: 'Connect a vector database for RAG',
    description: 'Add a retrieval tool that queries a vector store (Pinecone, Weaviate, or pgvector) and injects context into the system prompt. Use the tool result card pattern for retrieval results.',
    complexity: 'large',
  },
  {
    title: 'Add streaming artifact generation',
    description: 'Implement a generate_artifact tool that streams HTML/React component code. Render the output in a side panel using the existing ArtifactCard pattern from packages/ui/src/tool-results/.',
    complexity: 'medium',
  },
]
```

### D. File Tree of `libs/ui/src/ai/` Components to Extract

The following 25 files from `libs/ui/src/ai/` are extracted (in dependency order for building):

1. `tool-result-registry.tsx` — stripped of all `register()` calls
2. `confirmation-card.tsx` — verbatim (no automaker deps)
3. `shimmer.tsx` — verbatim
4. `inline-citation.tsx` — verbatim
5. `message-sources.tsx` — verbatim
6. `suggestion.tsx` — verbatim
7. `message-actions.tsx` — verbatim
8. `message-branches.tsx` — verbatim
9. `chat-message-markdown.tsx` — verbatim
10. `code-block.tsx` — verbatim
11. `prompt-input-context.tsx` — verbatim
12. `slash-command-dropdown.tsx` — verbatim
13. `chat-input.tsx` — verbatim
14. `task-block.tsx` — verbatim
15. `subagent-block.tsx` — verbatim
16. `plan-part.tsx` — verbatim
17. `tool-invocation-part.tsx` — strip automaker registrations
18. `chain-of-thought.tsx` — inline `formatDuration`, remove `@protolabsai/utils` import
19. `chat-message.tsx` — verbatim (imports from local, not `@protolabsai/ui`)
20. `chat-message-list.tsx` — verbatim
21. `loader.tsx` — verbatim (renamed from `shimmer.tsx` alias)
22. `reasoning-part.tsx` — verbatim
23. `checkpoint-marker.tsx` — verbatim
24. `queue-view.tsx` — excluded (automaker board-specific, no starter equivalent)
25. `index.ts` — re-exported with full named export list

`inline-form-card.tsx` and its stories are excluded; they are automaker HITL-form specific, not general-purpose.

`subagent-approval-card.tsx` is excluded; it is automaker agent-orchestration specific.

Tool result cards under `tool-results/` are excluded entirely. Users register their own via the registry.

One example tool result card — `weather-result-card.tsx` — is authored fresh for the starter kit as a reference implementation.
