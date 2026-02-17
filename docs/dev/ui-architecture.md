# UI Component Architecture

This document maps protoLabs's UI component structure for developers working on the frontend. All UI code lives in `apps/ui/src/`.

## Table of Contents

- [View Components](#view-components)
- [Store Architecture](#store-architecture)
- [Routing](#routing)
- [Known Gaps](#known-gaps)

## View Components

### Agent Runner (`components/views/agent-view/`)

Full-featured chat interface for interacting with AI agents.

**Core Components (~12 total):**

- `agent-view.tsx` - Main container
- `agent-header.tsx` - Model selector, queue display
- `agent-chat-area.tsx` - Message scroll container
- `agent-message.tsx` - Individual message rendering
- `thinking-indicator.tsx` - Loading states
- `agent-input-area.tsx` - User input with controls
- Message type variants (user, assistant, system, tool)
- Queue management UI

**Key Features:**

- Real-time message streaming via WebSocket
- Model selection (haiku/sonnet/opus)
- Feature queue display
- Thinking indicator during agent processing
- Markdown rendering with syntax highlighting

### Board View (`components/views/board-view/`)

Kanban board for feature management with extensive dialog system.

**Core Components (20+ dialogs):**

- `board-view.tsx` - Main Kanban board
- `board-column.tsx` - Status columns (backlog/in-progress/review/done)
- `board-card.tsx` - Feature cards with drag-and-drop
- `board-list-view.tsx` - Alternative list view
- `board-search.tsx` - Feature filtering
- `worktree-panel.tsx` - Git worktree management

**Dialogs (20+ components):**

- **Planning**: `plan-dialog.tsx`, `backlog-plan-dialog.tsx`, `plan-approval-dialog.tsx`, `plan-settings-dialog.tsx`
- **PR Management**: `pr-dialog.tsx`, `pr-feedback-dialog.tsx`
- **Worktrees**: `worktree-dialog.tsx`, `worktree-delete-dialog.tsx`
- **Dependencies**: `dependency-dialog.tsx`, `dependency-graph-dialog.tsx`
- **Feature Operations**: `create-feature-dialog.tsx`, `edit-feature-dialog.tsx`, `delete-feature-dialog.tsx`, `clone-feature-dialog.tsx`, `move-feature-dialog.tsx`
- **Execution**: `execute-dialog.tsx`, `agent-output-dialog.tsx`
- **Images**: `image-upload-dialog.tsx`, `image-view-dialog.tsx`
- **Projects**: `project-create-dialog.tsx`, `project-list-dialog.tsx`

**Key Features:**

- Drag-and-drop between columns
- Real-time status updates via WebSocket
- Feature search and filtering
- Worktree isolation for parallel development
- Dependency management
- PR creation and review
- Agent output viewing

### Settings View (`components/views/settings-view/`)

Comprehensive configuration system with 60+ components organized by category.

**Major Sections:**

#### API Keys & Authentication

- `api-keys-settings.tsx` - Anthropic, GitHub, Linear, Discord tokens
- Provider-specific key management

#### MCP Servers

- `mcp-servers-settings.tsx` - Model Context Protocol server configuration
- Server status monitoring
- Tool permissions

#### Model Configuration

- `model-defaults-settings.tsx` - Default model selection per feature complexity
- Model alias resolution (haiku/sonnet/opus)
- Cost tracking preferences

#### Prompt Templates

- `prompts-settings.tsx` - System prompt customization
- Feature-specific prompt overrides
- Context injection rules

#### Providers

- `claude-provider-settings.tsx` - Claude API configuration
- `codex-provider-settings.tsx` - OpenAI Codex settings
- `cursor-provider-settings.tsx` - Cursor integration
- `opencode-provider-settings.tsx` - Open source model providers

#### Security

- `security-settings.tsx` - ALLOWED_ROOT_DIRECTORY, path restrictions
- Sandbox settings
- API key visibility controls

#### Terminal & Execution

- `terminal-settings.tsx` - Shell preferences, history size
- Command whitelisting
- Process timeout configuration

#### Worktrees & Git

- `worktrees-settings.tsx` - Worktree cleanup policies
- Branch naming conventions
- Auto-merge preferences

#### Feature Defaults

- `feature-defaults-settings.tsx` - Default complexity, priority, status
- Auto-assignment rules

#### Event Hooks

- `event-hooks-settings.tsx` - Webhook configuration for feature lifecycle events
- Discord notifications
- External integrations

#### Keyboard Shortcuts

- `keyboard-shortcuts-settings.tsx` - Customizable keybindings
- Chord key support

**Architecture Pattern:**
Each settings section follows a consistent structure:

```tsx
// 1. Read settings from store
const { settings } = useAppStore();

// 2. Local state for edits
const [localValue, setLocalValue] = useState(settings.someValue);

// 3. Update handler with validation
const handleSave = async () => {
  await api.updateSettings({ someValue: localValue });
  // Update store
};

// 4. Form UI with inputs and save button
```

### Project Settings View (`components/views/project-settings-view/`)

Per-project configuration overrides.

**Sections:**

- `project-identity.tsx` - Name, description, owner
- `project-models.tsx` - Project-specific model overrides
- `claude-config.tsx` - Claude SDK configuration
- `project-themes.tsx` - UI theme preferences
- `project-webhooks.tsx` - Project-specific webhook endpoints
- `project-worktree-prefs.tsx` - Worktree behavior for this project

**Key Features:**

- Settings inheritance (global → project override)
- Per-project API keys
- Custom prompt templates per project

### Planning View

**Components:**

- `planning-mode-selector.tsx` - Switch between planning modes
- `dependency-graph-view.tsx` - Visual dependency graph
- Plan dialogs (see Board View dialogs above)

**Missing (Known Gap):**
Standalone PRD → Milestones → Phases → Features workflow view. Currently planning is embedded in board dialogs rather than a dedicated view.

### Context View (`components/views/context-view.tsx`)

Manage context files that are injected into agent prompts.

**Key Features:**

- List all `.automaker/context/*.md` files
- Create/edit/delete context files
- Preview how context is injected into prompts
- File path and description display

**Use Cases:**

- Add coding standards (TypeScript strict mode, naming conventions)
- Define architectural patterns
- Security policies
- Testing guidelines

### Ideation View (`components/views/ideation-view/`)

Idea management and prompt organization.

**Components:**

- `ideation-dashboard.tsx` - Overview of ideas
- `prompt-categories.tsx` - Organized prompt library
- `prompt-lists.tsx` - Saved prompt templates

**Key Features:**

- Idea capture and organization
- Prompt template library
- Category-based browsing

### GitHub Integration

#### Issues View (`components/views/github-issues-view/`)

- `github-issues-list.tsx` - Issue listing with filters
- `github-issue-detail-panel.tsx` - Issue details, comments, labels
- `github-issue-filters.tsx` - Filter by status, labels, assignee
- `github-issue-validation.tsx` - Validate issue format

**Key Features:**

- Sync GitHub issues to board features
- Bi-directional sync (board → GitHub)
- Issue triage and labeling

#### PRs View (`components/views/github-prs-view.tsx`)

- PR listing and filtering
- PR status tracking
- Code review integration
- Merge conflict detection

### Other Views

**Dashboard** (`components/views/dashboard-view.tsx`)

- Project overview
- Recent activity feed
- Agent status summary
- Quick actions

**Notifications** (`components/views/notifications-view.tsx`)

- Event stream display
- Notification preferences
- Mark as read/unread

**Memory** (`components/views/memory-view.tsx`)

- Agent memory management
- Context file usage tracking
- Memory file editing

**Chat History** (`components/views/chat-history-view.tsx`)

- Past agent conversations
- Session replay
- Export conversations

**Interview/Onboarding** (`components/views/interview-view.tsx`, `onboarding-view.tsx`)

- Initial setup wizard
- Project configuration interview
- Feature creation tutorial

**Analysis** (`components/views/analysis-view.tsx`)

- Codebase structure analysis
- Dependency graphs
- Code metrics

**Graph View** (`components/views/graph-view.tsx`)

- Visual dependency graph
- Feature relationships
- Epic hierarchies

## Store Architecture

protoLabs uses [Zustand](https://zustand-demo.pmnd.rs/) for state management with localStorage persistence.

### App Store (`store/app-store.ts`)

Main application state with persistence.

**State Slices:**

```typescript
interface AppStore {
  // Board state
  selectedProject: string | null;
  boardViewMode: 'kanban' | 'list';
  boardFilters: {
    status?: FeatureStatus[];
    complexity?: Complexity[];
    search?: string;
  };

  // View state
  activeView: 'board' | 'agent' | 'settings' | 'planning' | ...;
  sidebarCollapsed: boolean;

  // Agent state
  activeFeatureId: string | null;
  agentMessages: Message[];
  agentQueue: Feature[];

  // Preferences
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;

  // Settings
  settings: GlobalSettings;

  // Actions
  setSelectedProject: (projectPath: string) => void;
  setBoardViewMode: (mode: 'kanban' | 'list') => void;
  updateSettings: (partial: Partial<GlobalSettings>) => Promise<void>;
  // ... more actions
}
```

**Persistence:**

- Uses `zustand/middleware` `persist`
- Stores to `localStorage` with key `automaker-app-store`
- Selective persistence (excludes ephemeral state like messages)

**Usage Example:**

```tsx
import { useAppStore } from '@/store/app-store';

function MyComponent() {
  const { selectedProject, setSelectedProject } = useAppStore();

  return (
    <select value={selectedProject ?? ''} onChange={(e) => setSelectedProject(e.target.value)}>
      {/* ... */}
    </select>
  );
}
```

### Setup Store (`store/setup-store.ts`)

Onboarding and setup flow state.

**State:**

```typescript
interface SetupStore {
  // Setup progress
  currentStep: 'welcome' | 'api-keys' | 'project' | 'complete';
  completedSteps: string[];

  // Temporary data during setup
  tempApiKey: string | null;
  tempProjectPath: string | null;

  // Actions
  nextStep: () => void;
  previousStep: () => void;
  completeSetup: () => void;
}
```

**Persistence:**

- Persists to `localStorage` with key `automaker-setup-store`
- Cleared after setup completion

### WebSocket State

Real-time updates are managed via WebSocket connection, not Zustand:

**Implementation:**

```tsx
// apps/ui/src/lib/websocket.ts
export class WebSocketClient {
  on(event: string, handler: (data: unknown) => void): void;
  emit(event: string, data: unknown): void;
}

// Usage in components
useEffect(() => {
  const ws = getWebSocketClient();

  ws.on('feature:status_changed', (data) => {
    // Update UI
  });

  return () => ws.off('feature:status_changed');
}, []);
```

**Events:**

- `feature:created`, `feature:updated`, `feature:deleted`
- `feature:status_changed`
- `agent:started`, `agent:completed`, `agent:failed`
- `message:new` (agent chat messages)
- `worktree:created`, `worktree:deleted`
- `pr:created`, `pr:merged`

## Routing

protoLabs uses [TanStack Router](https://tanstack.com/router) with file-based routing.

### Route Structure

```
apps/ui/src/routes/
├── __root.tsx              # Root layout with sidebar, header
├── index.tsx               # Dashboard (/)
├── board.tsx               # Kanban board (/board)
├── agent.tsx               # Agent chat (/agent)
├── settings/
│   ├── index.tsx           # Settings home (/settings)
│   ├── api-keys.tsx        # API keys (/settings/api-keys)
│   ├── models.tsx          # Model config (/settings/models)
│   └── ...
├── project-settings.tsx    # Project settings (/project-settings)
├── planning.tsx            # Planning view (/planning)
├── context.tsx             # Context files (/context)
├── ideation.tsx            # Ideation (/ideation)
├── github/
│   ├── issues.tsx          # GitHub issues (/github/issues)
│   └── prs.tsx             # GitHub PRs (/github/prs)
└── ...
```

### Route Definition Pattern

```tsx
// apps/ui/src/routes/board.tsx
import { createFileRoute } from '@tanstack/react-router';
import { BoardView } from '@/components/views/board-view/board-view';

export const Route = createFileRoute('/board')({
  component: BoardView,
  // Optional: preload data
  loader: async () => {
    const features = await api.listFeatures();
    return { features };
  },
});
```

### Navigation

```tsx
import { useNavigate } from '@tanstack/react-router';

function MyComponent() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({ to: '/board', search: { status: 'backlog' } });
  };
}
```

### Route Guards

Protected routes check for API key configuration:

```tsx
// apps/ui/src/routes/__root.tsx
export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const settings = await api.getSettings();

    if (!settings.anthropicApiKey && location.pathname !== '/settings/api-keys') {
      throw redirect({ to: '/settings/api-keys' });
    }
  },
  component: RootLayout,
});
```

## Known Gaps

### Standalone Project Planning View

**Missing:** Dedicated PRD → Milestones → Phases → Features workflow UI

**Current State:**

- Planning is embedded in board dialogs
- Project creation via `project-create-dialog.tsx` opens in modal
- No dedicated view for managing project hierarchy

**Desired State:**

- Dedicated `/planning/:projectSlug` route
- Visual PRD editor
- Milestone/phase cards with drag-and-drop
- Inline feature creation from phases
- Dependency visualization in planning context

**Related Features:**

- `feature-1770360655459-xxxxxxx` - Standalone planning view (backlog)

### My Tasks Filter

**Missing:** Filter board by assignee to show "my work"

**Current State:**

- Board shows all features for selected project
- No assignee filtering

**Desired State:**

- "My Tasks" button in board header
- Filter board to show only features assigned to current user
- Persist filter preference in app store

**Related Features:**

- Created in backlog, ID pending

### Priority and Due Date Badges

**Missing:** Visual priority indicators and due date badges on board cards

**Current State:**

- Features have `priority` and `dueDate` fields
- Not displayed on board cards

**Desired State:**

- Priority badge (P0/P1/P2/P3) with color coding
- Due date badge with overdue highlighting
- Hover tooltip with full details

**Related Features:**

- Created in backlog, ID pending

### Auto-Mode UI Controls

**Missing:** Visual controls for auto-mode settings in UI

**Current State:**

- Auto-mode configuration via API or CLI
- No UI for setting `maxConcurrency`, viewing queue, or pausing

**Desired State:**

- Auto-mode settings panel in board header
- Real-time queue display
- Start/stop/pause controls
- Concurrency slider

**Potential Location:**

- Board view header or right sidebar panel

---

## Contributing

When adding new UI components:

1. **Place in correct view directory** (`components/views/{view-name}/`)
2. **Use Zustand stores** for shared state (don't duplicate state in components)
3. **Connect to WebSocket** for real-time updates
4. **Follow TanStack Router** patterns for navigation
5. **Update this document** with new components and their purpose

For questions or improvements to this doc, see `docs/agents/README.md`.
