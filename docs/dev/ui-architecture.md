# UI Component Architecture

This document maps protoLabs's UI component structure for developers working on the frontend. All UI code lives in `apps/ui/src/`.

## Table of Contents

- [View Components](#view-components)
- [Store Architecture](#store-architecture)
- [Routing](#routing)
- [Known Gaps](#known-gaps)

## View Components

### Board View (`components/views/board-view/`)

Kanban board for feature management with an extensive dialog system.

**Core Components:**

- `board-view.tsx` — Main Kanban board (1,908 lines — known tech debt, decomposition planned)
- `board-view/components/` — Board-specific sub-components

**Dialogs (`board-view/dialogs/`, 27 components):**

- **Feature CRUD**: `add-feature-dialog.tsx`, `edit-feature-dialog.tsx`, `delete-completed-feature-dialog.tsx`
- **Planning**: `backlog-plan-dialog.tsx`, `plan-approval-dialog.tsx`, `plan-settings-popover.tsx`
- **Pipeline**: `pipeline-settings-dialog.tsx`, `add-edit-pipeline-step-dialog.tsx`
- **Worktrees**: `create-worktree-dialog.tsx`, `delete-worktree-dialog.tsx`, `commit-worktree-dialog.tsx`, `merge-worktree-dialog.tsx`, `view-worktree-changes-dialog.tsx`, `pull-resolve-conflicts-dialog.tsx`, `push-to-remote-dialog.tsx`, `worktree-settings-popover.tsx`
- **Dependencies**: `dependency-link-dialog.tsx`, `dependency-tree-dialog.tsx`
- **Git**: `create-branch-dialog.tsx`, `create-pr-dialog.tsx`
- **Agent Output**: `agent-output-modal.tsx`
- **Bulk Operations**: `mass-edit-dialog.tsx`, `archive-all-verified-dialog.tsx`, `delete-all-verified-dialog.tsx`, `completed-features-modal.tsx`
- **Follow-up**: `follow-up-dialog.tsx`
- **Auto-mode**: `auto-mode-settings-popover.tsx`

**Key Features:**

- Drag-and-drop between status columns
- Real-time status updates via WebSocket → TanStack Query invalidation
- Feature search and filtering
- Worktree isolation for parallel development
- Dependency management and visualization
- PR creation and agent output viewing

### Settings View (`components/views/settings-view/`)

Comprehensive configuration system organized by category. See the directory for the full list of settings panels (API keys, MCP servers, model config, prompts, providers, security, terminal, worktrees, feature defaults, event hooks, keyboard shortcuts).

### Project Settings View (`components/views/project-settings-view/`)

Per-project configuration overrides — identity, models, Claude config, themes, webhooks, worktree preferences.

### Dashboard View (`components/views/dashboard-view/`)

Project overview with directory components for sub-views.

### Analytics View (`components/views/analytics-view/`)

Analytics dashboard with directory components for sub-views.

### Terminal View (`components/views/terminal-view/`)

Embedded terminal with directory components. (1,809 lines — known tech debt, decomposition planned.)

### Graph View (`components/views/graph-view/`)

Visual dependency graph and feature relationship visualization. Has a dedicated `graph-view-page.tsx` entry point.

### Spec View (`components/views/spec-view/`)

Project specification viewer and editor with directory components.

### Setup View (`components/views/setup-view/`)

Initial setup and onboarding wizard with directory components.

### GitHub Issues View (`components/views/github-issues-view/`)

GitHub issue listing, filtering, and sync with board features. Has directory components.

### Single-File Views

These views are implemented as standalone files without sub-component directories:

| View                    | File                          | Purpose                               |
| ----------------------- | ----------------------------- | ------------------------------------- |
| Agent Tools             | `agent-tools-view.tsx`        | Available agent tool listing          |
| Analysis                | `analysis-view.tsx`           | Codebase structure analysis           |
| Authority Agents Status | `authority-agents-status.tsx` | PM/ProjM/EM agent status              |
| Authority Event Feed    | `authority-event-feed.tsx`    | Authority system event stream         |
| Chat History            | `chat-history.tsx`            | Past agent conversations              |
| Code View               | `code-view.tsx`               | Code file viewer                      |
| Context                 | `context-view.tsx`            | `.automaker/context/` file management |
| Escalation Dashboard    | `escalation-dashboard.tsx`    | Escalation tracking                   |
| Feature Detail          | `feature-detail.tsx`          | Individual feature view               |
| GitHub PRs              | `github-prs-view.tsx`         | PR listing and status                 |
| Interview               | `interview-view.tsx`          | Project configuration interview       |
| Logged Out              | `logged-out-view.tsx`         | Unauthenticated state                 |
| Login                   | `login-view.tsx`              | Authentication                        |
| Memory                  | `memory-view.tsx`             | Agent memory management               |
| Notifications           | `notifications-view.tsx`      | Event stream and notification display |
| PRD Review Modal        | `prd-review-modal.tsx`        | PRD review and approval               |
| Running Agents          | `running-agents-view.tsx`     | Active agent monitoring               |
| Welcome                 | `welcome-view.tsx`            | First-run welcome screen              |
| Wiki                    | `wiki-view.tsx`               | Documentation/wiki viewer             |

## Store Architecture

protoLabs uses [Zustand 5](https://zustand-demo.pmnd.rs/) for client state management. Server state is managed by TanStack Query 5.

### Stores

| Store                 | File                           | Purpose                              | Persistence |
| --------------------- | ------------------------------ | ------------------------------------ | ----------- |
| `app-store`           | `store/app-store.ts`           | Board state, view state, preferences | API sync    |
| `auth-store`          | `store/auth-store.ts`          | Authentication state, API keys       | API sync    |
| `settings-store`      | `store/settings-store.ts`      | User settings and preferences        | API sync    |
| `chat-store`          | `store/chat-store.ts`          | Chat/conversation state              | API sync    |
| `ai-models-store`     | `store/ai-models-store.ts`     | AI model configuration               | API sync    |
| `setup-store`         | `store/setup-store.ts`         | Onboarding flow state                | Ephemeral   |
| `terminal-store`      | `store/terminal-store.ts`      | Terminal session state               | Ephemeral   |
| `worktree-store`      | `store/worktree-store.ts`      | Git worktree state                   | Ephemeral   |
| `notifications-store` | `store/notifications-store.ts` | Notification queue                   | Ephemeral   |

### State Management Rules

- Colocate state as close to its consumer as possible — prefer local `useState` over global store
- Only lift to Zustand when 2+ unrelated components need the same data
- Use selectors to prevent unnecessary re-renders: `useAppStore(s => s.theme)`
- Never put ephemeral state (loading, form inputs) in the global store
- Server state goes through TanStack Query 5, never Zustand
- WebSocket events trigger query invalidation, not direct state mutation

### Real-Time Updates

Real-time data is delivered via WebSocket and processed through TanStack Query invalidation, not direct Zustand mutation:

```
WebSocket event → invalidate relevant TanStack Query → UI re-renders with fresh data
```

The WebSocket connection is managed within `apps/ui/src/lib/http-api-client.ts` (not a standalone `websocket.ts` file).

## Routing

protoLabs uses [TanStack Router](https://tanstack.com/router) with file-based routing.

### Route Structure

```
apps/ui/src/routes/
├── __root.tsx              # Root layout with sidebar, CopilotKit provider
├── index.tsx               # Dashboard (/)
├── board.tsx               # Kanban board (/board)
├── context.tsx             # Context files (/context)
├── dashboard.tsx           # Dashboard (/dashboard)
├── github-issues.tsx       # GitHub issues (/github-issues)
├── github-prs.tsx          # GitHub PRs (/github-prs)
├── graph.tsx               # Dependency graph (/graph)
├── interview.tsx           # Project interview (/interview)
├── logged-out.tsx          # Logged out (/logged-out)
├── login.tsx               # Login (/login)
├── memory.tsx              # Agent memory (/memory)
├── notifications.tsx       # Notifications (/notifications)
├── project-settings.tsx    # Project settings (/project-settings)
├── running-agents.tsx      # Running agents (/running-agents)
├── settings.tsx            # Settings (/settings)
├── setup.tsx               # Setup wizard (/setup)
├── spec.tsx                # Project spec (/spec)
├── terminal.tsx            # Terminal (/terminal)
├── wiki.tsx                # Wiki (/wiki)
└── analytics.tsx           # Analytics (/analytics)
```

All routes are flat files — there are no nested route directories (e.g., no `settings/` or `github/` subdirectories).

### Route Definition Pattern

```tsx
// apps/ui/src/routes/board.tsx
import { createFileRoute } from '@tanstack/react-router';
import { BoardView } from '@/components/views/board-view/board-view';

export const Route = createFileRoute('/board')({
  component: BoardView,
});
```

### Navigation

```tsx
import { useNavigate } from '@tanstack/react-router';

function MyComponent() {
  const navigate = useNavigate();
  const handleClick = () => navigate({ to: '/board' });
}
```

## Known Gaps

### God Store

`app-store.ts` is 4,268 lines with all board, view, agent, and preference state. Target: split into domain slices (board, agent, settings, theme).

### Monolithic Views

`board-view.tsx` (1,908 lines) and `terminal-view.tsx` (1,809 lines) need decomposition into sub-components.

### Standalone Project Planning View

Planning is embedded in board dialogs rather than a dedicated view. Desired: `/planning/:projectSlug` route with visual PRD editor, milestone/phase cards, and inline feature creation.

### Priority and Due Date Badges

Features have `priority` and `dueDate` fields but these aren't displayed on board cards. Desired: colored priority badges and overdue highlighting.

---

## Contributing

When adding new UI components:

1. **Place in correct view directory** (`components/views/{view-name}/`)
2. **Use Zustand stores** for shared client state, TanStack Query for server state
3. **Use query invalidation** for real-time updates (not direct state mutation)
4. **Follow TanStack Router** patterns for navigation
5. **Update this document** with new components and their purpose
