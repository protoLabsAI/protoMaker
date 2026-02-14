# PRD: CopilotKit + LangGraph AI Workflow Side Panel

## Situation

Automaker has built a sophisticated LangGraph-based flow orchestration system (`libs/flows/`) with multiple production workflows:

- **Content Creation Pipeline** (12 features, merged): Research → outline → write → antagonistic review → export. Includes dual-reviewer consensus and XML output parsing. Full system at `libs/flows/src/content/`.
- **Antagonistic Review Graph** (12 features, merged): Ava+Jon dual-reviewer pattern with consensus checking at `libs/flows/src/antagonistic-review/`.
- **Section Writer Subgraph**: Smart→fast model fallback with retry loops and Zod validation.

**Current state**:
- All flows execute server-side only via MCP tools (`create-content`, `review-content`, etc.)
- No UI for monitoring flow progress, viewing per-node status, or approving HITL checkpoints
- Content pipeline has manual approval points (post-antagonistic-review scoring) but they run straight-through (no checkpointer)
- Flows use `@langchain/langgraph` v1.1.2 with `Annotation.Root()`, custom reducers, and XML output parsing
- Frontend is React 19 + Vite 7 + Tailwind CSS 4 with OKLCh color tokens (41 themes) and shadcn/ui components

**Recent completions**:
- Linear Specialist agent template with delegation routing (PR #469, just merged)
- Sam (AI Agent Engineer) owns `libs/flows/`, `libs/llm-providers/`, `libs/observability/`
- Matt (Frontend Engineer) owns component architecture and Tailwind CSS 4 theming
- Proven multi-agent delegation patterns via `execute_dynamic_agent`

**Research completed** (2026-02-14):
- Matt researched CopilotKit v1.51.3 UI components, theming (OKLCh-compatible), React 19 support, Express integration
- Sam researched LangGraph.js streaming modes (`values`, `updates`, `custom`), AG-UI protocol, state synchronization
- Explored mythxengine (rpg-mcp) and rabbit-hole.io codebases — both have production CopilotKit + LangGraph integrations with HITL

## Problem

**P1: No visibility into running workflows**
- Users launch content creation via `/create-content` MCP tool but have no real-time status
- Can't see which node is executing, how far along the pipeline is, or what the current activity is
- Flows can run for minutes (12-feature project ~4 hours with 6 concurrent agents) with zero progress feedback

**P2: HITL checkpoints run straight-through**
- Content pipeline has antagonistic review scoring (6 dimensions, pass/fail thresholds) but no actual human approval
- Users want to review PRD content in a TipTap editor before agents scaffold features
- No way to approve/reject/edit intermediate results (entity extractions, phase completions, review scores)

**P3: Workflow invocation is tool-based, not UI-native**
- Must use MCP tools or CLI skills — no in-app workflow launcher
- Can't dynamically select which workflow to run, which model to use (haiku/sonnet/opus), or pass custom parameters
- No project-aware context — workflows don't automatically load project spec, feature list, or board state

**P4: Multiple workflows, no unified interface**
- Content pipeline, antagonistic review, future workflows (code review, PRD generation, etc.) all have separate MCP tools
- No single place to manage/monitor all LangGraph executions
- Can't switch between workflows mid-session or run multiple in parallel

**Business impact**:
- Users avoid using flows because they can't monitor progress or intervene
- Manual workarounds (polling MCP status, checking file outputs) slow iteration
- HITL approval bottleneck prevents autonomous execution

## Approach

### Architecture Overview

Build a **persistent AI workflow side panel** using CopilotKit v1.51.3 that:
1. Integrates with our Express 5 backend (`/api/copilotkit` route)
2. Registers multiple LangGraph agents (content pipeline, review graph, future workflows)
3. Provides real-time streaming with per-node status updates
4. Renders inline HITL approval UIs (TipTap editor for PRDs, step wizards, forms, dialogs)
5. Allows workflow/agent/model selection with project context injection

### Components

**Backend** (`apps/server/`):
- **CopilotRuntime** at `/api/copilotkit` — Express router via `createCopilotEndpointExpress`
- **LangGraph agent registration** — `LangGraphAgent` entries for each workflow (`content-pipeline`, `antagonistic-review`, etc.)
- **Flow modifications** (`libs/flows/`):
  - Add `...CopilotKitStateAnnotation.spec` to all flow state annotations
  - Add `MemorySaver` checkpointer to all compiled graphs (required for HITL)
  - Add `copilotkitEmitState(config, { currentActivity, progress })` calls in graph nodes
  - Add `interrupt(reviewData)` calls at HITL checkpoints (post-review, PRD approval, entity extraction)

**Frontend** (`apps/ui/`):
- **CopilotSidebar** component (`width="50vw"`, auto full-screen on mobile <768px)
- **Workflow selector** dropdown/menu (content pipeline, antagonistic review, etc.)
- **Model selector** (haiku/sonnet/opus)
- **Project context provider** — auto-injects current project path, spec, feature list via `useCopilotReadable`
- **HITL interrupt handlers** — `useLangGraphInterrupt` with custom renderers:
  - **PRD approval**: TipTap editor modal for reviewing/editing PRD content
  - **Entity review**: Step wizard with entity list, merge/correct controls
  - **Phase approvals**: Inline form with approve/reject/edit options
  - **Generic approvals**: Simple yes/no dialog

**Theming**:
- CSS variable bridge mapping our OKLCh tokens (`--background`, `--foreground`, `--primary`) to CopilotKit's internal design system
- Automatic dark mode and 41-theme support with zero custom code

### Technology Choices

| Choice | Rationale |
|--------|-----------|
| **CopilotSidebar** (built-in) | Free tier, handles layout/animation/accessibility, half-screen desktop + full mobile |
| **Express adapter** | `createCopilotEndpointExpress` drops into our existing server, no Next.js needed |
| **LangGraphAgent** per workflow | Multi-agent runtime, named routing via `agent` prop |
| **MemorySaver checkpointer** | Required for HITL interrupt/resume, simple in-memory implementation (no Redis) |
| **`updates` + `custom` stream modes** | Node-level status (updates) + custom progress messages (custom) |
| **TipTap for PRD editing** | Already used in rabbit-hole.io, rich editing with markdown export |
| **Step wizard for multi-phase HITL** | Proven pattern in rpg-mcp for complex approval flows |

### Key Design Decisions

**1. Built-in CopilotSidebar vs headless**
- **Decision**: Use built-in `CopilotSidebar` with CSS theming
- **Rationale**: Free tier, proven UX patterns, our OKLCh tokens are compatible. Headless requires Premium license and 5-7 days extra effort.

**2. LangGraph.js (TypeScript) vs Python flows**
- **Decision**: Keep existing `@langchain/langgraph` (TypeScript) flows
- **Rationale**: Flows already production-ready, CopilotKit supports both, no migration needed

**3. In-process graph execution vs LangGraph Cloud**
- **Decision**: In-process (flows run in Express server)
- **Rationale**: No external dependencies, lower latency, full control. LangGraph Cloud adds cost + complexity.

**4. MemorySaver vs Redis checkpointer**
- **Decision**: Start with `MemorySaver` (in-memory)
- **Rationale**: Simpler, no Redis dependency. Can upgrade later for multi-server deployments.

**5. TipTap editor vs plain textarea for PRD editing**
- **Decision**: TipTap rich editor
- **Rationale**: Better UX for markdown editing, already proven in rabbit-hole.io, supports formatting toolbar

## Results

### Success Metrics

**Workflow visibility**:
- Users can see which node is executing within 500ms of status change
- Progress indicators show % complete (calculated from current node / total nodes)
- Activity messages display in real-time

**HITL engagement**:
- PRD approval flow: Users can review, edit, approve/reject PRD in TipTap editor
- Entity extraction: Users can merge duplicates, correct names, approve/reject entities
- Approval latency: <2s from `interrupt()` call to UI render

**Multi-workflow launcher**:
- Users can select from 2+ workflows (content pipeline, antagonistic review, etc.)
- Model selection (haiku/sonnet/opus) persists per workflow
- Project context auto-injected (spec, feature list, board state)

**UX quality**:
- Sidebar toggle hotkey (`Cmd+K` or user-configurable)
- Responsive: half-screen on desktop (>=768px), full-screen on mobile
- Theme compatibility: works across all 41 themes with zero custom overrides
- Accessibility: keyboard navigation, screen reader support (handled by CopilotKit)

**Performance**:
- Sidebar open/close animation <300ms
- Streaming updates render within 100ms of event
- No blocking on main thread (streaming handled via async iteration)

### User Experience (Before → After)

**Before**:
1. User runs `/create-content` MCP tool
2. Waits 4+ hours with zero feedback
3. Checks file system for `agent-output.md`
4. No way to intervene or approve intermediate results

**After**:
1. User clicks persistent "AI Workflows" button (or presses `Cmd+K`)
2. Sidebar slides open, shows workflow selector
3. Selects "Content Creation Pipeline", chooses model (sonnet), clicks "Run"
4. Real-time updates: "Researching topic...", "Outlining sections...", "Writing section 1/8...", etc.
5. Antagonistic review completes -> TipTap editor modal appears with PRD content
6. User reviews, makes edits, clicks "Approve"
7. Flow resumes, scaffolds features, posts to Discord
8. Sidebar shows "Complete - 8 sections written, 3 features created"

## Constraints

### Technical Constraints

**1. CopilotKit peer dependencies**
- React: `^18 || ^19` (we're on React 19)
- Zod: `>=3.0.0` (we have Zod)
- Express: Must use `createCopilotEndpointExpress` (Express 5 compatibility needs testing)

**2. LangGraph.js checkpointer requirement**
- HITL interrupts require `MemorySaver` or `RedisSaver`
- Current flows use straight-through mode (no checkpointer)
- **Migration needed**: All flows must be recompiled with checkpointer

**3. State annotation changes**
- Every flow state must include `...CopilotKitStateAnnotation.spec`
- Breaks existing state typing if not spread correctly
- **Risk**: Flow compilation errors if state migration is incomplete

**4. Streaming mode limitations**
- `updates` mode only fires when node returns state changes
- If a node runs for 30s with no state updates, UI appears frozen
- **Mitigation**: Use `custom` mode + `config.writer()` for heartbeat messages

**5. TipTap editor bundle size**
- TipTap + extensions adds ~200KB to bundle
- **Mitigation**: Lazy-load editor component, only import when interrupt fires

### Timeline

- **Phase 1 (Foundation + Streaming)**: 1 week
- **Phase 2 (HITL - PRD Approval)**: 3-5 days
- **Phase 3 (Multi-workflow + Polish)**: 3-5 days
- **Total estimate**: ~2-3 weeks for full MVP

### Dependencies

**External**: CopilotKit v1.51.3, TipTap editor
**Internal**: `libs/flows/`, `libs/types/`, `apps/server/`, `apps/ui/`
**Blocking**: None — all prerequisite research complete

### Non-Goals

- Fully headless CopilotKit UI (requires Premium license)
- LangGraph Cloud deployment (in-process sufficient)
- Redis checkpointer (MemorySaver adequate for single-server)
- Voice input / audio transcription
- CoAgent generative UI (status text + progress bars sufficient)
- Multi-tenancy / user isolation

## Milestones

### Milestone 1: Foundation & Backend Integration

**Goal**: CopilotKit runtime integrated with Express, first agent registered, flows modified for state sync

1. Add CopilotKit dependencies + verify peer dep compatibility
2. Create Express route (`apps/server/src/routes/copilotkit/index.ts`)
3. Modify content pipeline state to include `CopilotKitStateAnnotation.spec`
4. Add MemorySaver checkpointer to compiled content flow graph
5. Register content-pipeline agent in CopilotRuntime
6. Test agent connection via `/api/copilotkit/info`

### Milestone 2: Streaming & Real-Time Status

**Goal**: Frontend displays live workflow status with per-node updates

1. Add `copilotkitEmitState()` calls in content pipeline nodes
2. Frontend provider setup (`<CopilotKit>` wrapper)
3. CopilotSidebar integration with CSS variable theming
4. `useCoAgent` state display (currentActivity, progress)
5. Workflow selector UI (dropdown)
6. Project context injection via `useCopilotReadable`

### Milestone 3: HITL — PRD Approval with TipTap Editor

**Goal**: Users can review, edit, approve/reject PRD content in a rich editor

1. Add `interrupt()` call post-antagonistic-review in content flow
2. TipTap editor modal component (`<PRDEditorModal>`)
3. `useLangGraphInterrupt` handler for PRD approval
4. Approve/reject flow with `resolve()` → graph resume
5. Graph resume logic for edited content

### Milestone 4: HITL — Advanced Approvals

**Goal**: Multiple interrupt types with custom UIs (step wizard, forms, dialogs)

1. Interrupt type routing (PRD → TipTap, entities → wizard, generic → dialog)
2. Step wizard component for entity merge/correct
3. Phase approval form (dynamic fields, approve/reject)
4. Generic approval dialog (fallback)
5. Interrupt payload TypeScript types

### Milestone 5: Multi-Workflow Support & Model Selection

**Goal**: Multiple workflows, model selection, parallel execution

1. Register antagonistic-review agent in runtime
2. Workflow metadata (name, description, params, models)
3. Model selector (haiku/sonnet/opus)
4. Parallel execution (multiple threadIds)
5. Workflow history (recent runs, status)

### Milestone 6: Polish & Production Readiness

**Goal**: Persistent state, hotkeys, error handling, docs

1. Persistent sidebar state (localStorage)
2. Global hotkey (`Cmd+K` / `Ctrl+K`)
3. Error handling + retry UI
4. Workflow abort ("Stop" button)
5. Documentation (`docs/dev/copilotkit-integration.md`)
6. E2E tests (Playwright)
