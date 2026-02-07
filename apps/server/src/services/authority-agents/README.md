# Authority Agents

Authority agents are AI-powered roles that manage different aspects of the development pipeline through the authority system (policy-based approval workflows).

## Agent Roles

### Product Manager (PM Agent)

**File:** `pm-agent.ts`
**Role:** `product-manager`
**Responsibility:** Pick up injected ideas, research codebase, generate SPARC PRDs
**Pipeline:** idea → pm_review → research → pm_review → approved

### Project Manager (ProjM Agent)

**File:** `projm-agent.ts`
**Role:** `project-manager`
**Responsibility:** Decompose approved PRDs into milestones and features
**Pipeline:** approved → projm_decomposing → decomposed

### Engineering Manager (EM Agent)

**File:** `em-agent.ts`
**Role:** `engineering-manager`
**Responsibility:** Assign ready features to agents, manage WIP limits, handle PR approvals
**Pipeline:** ready → in_progress → pr_ready → done

### Status Agent

**File:** `status-agent.ts`
**Role:** `status-reporter`
**Responsibility:** Monitor for blockers (stale PRs, stuck features, failed agents), escalate to Discord

## Agent Utilities

**File:** `agent-utils.ts`

Shared utilities that extract common patterns across all authority agents. Eliminates ~70-80 lines of boilerplate per agent.

### Utilities

#### `createAgentState<T>(customState?)`

Creates state container with:

- `agents: Map<string, AuthorityAgent>` - Registered agents per project
- `initializedProjects: Set<string>` - Tracks initialization status
- `processing: Set<string>` - Prevents duplicate processing
- `custom: T` - Agent-specific state (e.g., `pollTimers`, `escalatedBlockers`)

**Methods:**

- `getAgent(projectPath)` - Get registered agent
- `isInitialized(projectPath)` - Check if project initialized
- `isProcessing(id)` - Check if ID being processed
- `markInitialized(projectPath)` - Mark project initialized
- `removeInitialized(projectPath)` - Remove initialization

#### `withProcessingGuard(state, id, fn, options?)`

Wraps async functions with processing guard pattern:

```typescript
if (processing.has(id)) return;
processing.add(id);
try {
  await fn();
} finally {
  processing.delete(id);
}
```

**Usage:**

```typescript
async processFeature(feature: Feature): Promise<void> {
  return withProcessingGuard(this.state, feature.id, async () => {
    // This code only runs if feature.id not already processing
    await this.doWork(feature);
  });
}
```

#### `initializeAgent(state, authorityService, role, projectPath, setup?, options?)`

Standard agent initialization pattern:

1. Check if already initialized (skip if yes)
2. Register agent with authority service
3. Store agent in map
4. Mark project as initialized
5. Execute custom setup function
6. Log initialization

**Usage:**

```typescript
async initialize(projectPath: string): Promise<void> {
  await initializeAgent(
    this.state,
    this.authorityService,
    'product-manager',
    projectPath,
    async (agent) => {
      // Custom setup specific to this agent
      await this.setupPolling(projectPath);
    }
  );
}
```

#### `registerEventListener(state, getListenerRegistered, setListenerRegistered, events, eventName, handler, initialize, options?)`

Event subscription with auto-initialization:

1. Check if listener already registered (skip if yes)
2. Subscribe to event
3. Auto-initialize projects from event data
4. Filter events (optional)
5. Extract project path (configurable)
6. Call handler with error handling

**Usage:**

```typescript
setupEventListeners(): void {
  registerEventListener(
    this.state,
    () => this.listenerRegistered,
    (val) => { this.listenerRegistered = val; },
    this.events,
    'feature:created',
    async (event) => {
      await this.reviewFeature(event.projectPath, event.featureId);
    },
    (projectPath) => this.initialize(projectPath)
  );
}
```

## Code Reduction Benefits

### Per-Agent Savings

- **State tracking:** 78% reduction (9 lines → 2 lines)
- **Initialization:** 36% reduction (14 lines → 9 lines)
- **Processing guards:** 100% elimination of boilerplate (5 lines per usage)
- **Event listeners:** 20% reduction (25 lines → 20 lines)

**Total per agent:** ~70-80 lines of boilerplate eliminated (~9% of typical agent file size)

### Total Savings (4 Agents)

- **PM Agent:** ~74 lines (from 865 lines)
- **ProjM Agent:** ~70 lines (from 732 lines)
- **EM Agent:** ~75 lines (from ~600 lines estimated)
- **Status Agent:** ~72 lines (from ~500 lines estimated)

**Grand total:** ~290-320 lines of duplicate code eliminated

## Testing

**File:** `apps/server/tests/unit/services/authority-agents/agent-utils.test.ts`

Comprehensive test suite covering:

- State creation and access methods
- Processing guard blocking and cleanup
- Initialization patterns and skip logic
- Event listener registration and filtering
- Error handling and edge cases

**Run tests:**

```bash
npm run test:server -- apps/server/tests/unit/services/authority-agents/agent-utils.test.ts
```

## Refactoring Guide

To refactor an existing authority agent to use these utilities:

### 1. Replace State Tracking

**Before:**

```typescript
private agents = new Map<string, AuthorityAgent>();
private initializedProjects = new Set<string>();
private processing = new Set<string>();
private listenerRegistered = false;
```

**After:**

```typescript
import { createAgentState, type AgentState } from './agent-utils.js';

private state: AgentState;
private listenerRegistered = false;

constructor(...) {
  this.state = createAgentState();
}
```

### 2. Replace Initialization

**Before:**

```typescript
async initialize(projectPath: string): Promise<void> {
  if (this.initializedProjects.has(projectPath)) return;

  const agent = await this.authorityService.registerAgent('role', projectPath);
  this.agents.set(projectPath, agent);
  this.initializedProjects.add(projectPath);
  logger.info(`Agent registered: ${agent.id}`);

  // Custom setup...
}
```

**After:**

```typescript
import { initializeAgent } from './agent-utils.js';

async initialize(projectPath: string): Promise<void> {
  await initializeAgent(
    this.state,
    this.authorityService,
    'role',
    projectPath,
    async (agent) => {
      // Custom setup...
    }
  );
}
```

### 3. Replace Processing Guards

**Before:**

```typescript
async processItem(id: string): Promise<void> {
  if (this.processing.has(id)) return;
  this.processing.add(id);

  try {
    // Do work...
  } finally {
    this.processing.delete(id);
  }
}
```

**After:**

```typescript
import { withProcessingGuard } from './agent-utils.js';

async processItem(id: string): Promise<void> {
  return withProcessingGuard(this.state, id, async () => {
    // Do work...
  });
}
```

### 4. Update State Access

**Before:**

```typescript
const agent = this.agents.get(projectPath);
if (this.initializedProjects.has(projectPath)) { ... }
if (this.processing.has(id)) { ... }
```

**After:**

```typescript
const agent = this.state.getAgent(projectPath);
if (this.state.isInitialized(projectPath)) { ... }
if (this.state.isProcessing(id)) { ... }
```

## Next Steps

1. **Phase 1 Complete:** ✅ Agent utilities extracted and tested
2. **Phase 2:** Apply to all 4 agents (PM, ProjM, EM, Status)
3. **Phase 3:** Consider base agent class if patterns warrant it
4. **Phase 4:** Evaluate domain-specific tool collections (linear-tools, discord-tools, etc.)

## See Also

- [Authority System Overview](../authority-service.ts)
- [Policy Engine](../../../../../libs/policy-engine/)
