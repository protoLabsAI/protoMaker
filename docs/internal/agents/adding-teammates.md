# Adding Agent Teammates

This guide explains how to add new **authority agents** (autonomous team members like PM, ProjM, EM) to protoLabs's agent team.

## Table of Contents

- [What are Authority Agents?](#what-are-authority-agents)
- [When to Add a New Teammate](#when-to-add-a-new-teammate)
- [Teammate Creation Checklist](#teammate-creation-checklist)
- [Step-by-Step Guide](#step-by-step-guide)
- [Example: Adding a Designer Agent](#example-adding-a-designer-agent)
- [Testing Your Teammate](#testing-your-teammate)

## What are Authority Agents?

**Authority agents** are autonomous AI team members that handle specific responsibilities in the development pipeline. Unlike interactive agents (which respond to user prompts) or feature execution agents (which implement board tasks), authority agents operate autonomously on event-driven triggers.

**Current Team Members:**

- **PM (Product Manager)** - Researches ideas, generates SPARC PRDs
- **ProjM (Project Manager)** - Decomposes PRDs into milestones and features
- **EM (Engineering Manager)** - Reviews technical feasibility
- **Status Agent** - Monitors progress, escalates blockers

## When to Add a New Teammate

Add a new authority agent when:

1. **Clear domain responsibility** - The role has a well-defined scope (QA, Security, DevOps, Design, etc.)
2. **Event-driven trigger** - The agent can act on specific events (PR created, tests failed, deployment complete)
3. **Autonomous operation** - The agent can make decisions without human approval (subject to policy checks)
4. **Coordination need** - The agent needs to interact with other agents via events

**Don't add a teammate for:**

- One-off tasks (use a Skill instead)
- User-driven workflows (use interactive agents)
- Simple automation (use scheduled tasks)

## Teammate Creation Checklist

- [ ] Define the agent's role and responsibilities
- [ ] Identify event triggers (what activates this agent?)
- [ ] Design the agent's workflow states (idea → research → approved, etc.)
- [ ] Write the agent's system prompt (in `authority-agents/{name}-agent.ts`)
- [ ] Implement event listeners (which events does it subscribe to?)
- [ ] Define policy checks (what requires approval?)
- [ ] Add Discord notifications (how does it communicate status?)
- [ ] Wire into AuthorityService (register the agent on startup)
- [ ] Create tests for the agent's core logic
- [ ] Document the agent's role in `docs/authority/roles/`

## Step-by-Step Guide

### 1. Create the Agent File

Create `apps/server/src/services/authority-agents/{name}-agent.ts`:

```typescript
/**
 * {Name} Authority Agent - {Role Title}
 *
 * Responsibilities:
 * - {Responsibility 1}
 * - {Responsibility 2}
 * - {Responsibility 3}
 *
 * Pipeline:
 *   1. {Step 1}
 *   2. {Step 2}
 *   3. {Step 3}
 *
 * All state transitions go through AuthorityService.submitProposal()
 */

import type { Feature, AuthorityAgent } from '@protolabsai/types';
import { createLogger, loadContextFiles } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import { simpleQuery, streamingQuery } from '../../providers/simple-query-service.js';

const logger = createLogger('{Name}Agent');

/** Model for {specific task} */
const {NAME}_MODEL = resolveModelString('sonnet');

export class {Name}AuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;

  private agents = new Map<string, AuthorityAgent>();
  private initializedProjects = new Set<string>();
  private processing = new Set<string>();
  private listenerRegistered = false;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.registerEventListener();
  }

  /**
   * Register event listeners
   */
  private registerEventListener(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;

    // Listen to relevant events
    this.events.on('feature:status_changed', async (data) => {
      if (data.newStatus === 'your-trigger-status') {
        await this.handleTriggerEvent(data);
      }
    });
  }

  /**
   * Initialize agent identity for a project
   */
  async initializeForProject(projectPath: string): Promise<void> {
    if (this.initializedProjects.has(projectPath)) return;
    this.initializedProjects.add(projectPath);

    const agentIdentity: AuthorityAgent = {
      agentId: `{name}-${projectPath}`,
      role: '{role}',
      projectPath,
      capabilities: ['{capability1}', '{capability2}'],
      trustLevel: 'auto-approve', // or 'requires-approval'
    };

    this.agents.set(projectPath, agentIdentity);

    // Register with AuthorityService
    await this.authorityService.registerAgent(agentIdentity);

    logger.info(`{Name} agent initialized for project: ${projectPath}`);
  }

  /**
   * Handle event trigger
   */
  private async handleTriggerEvent(data: any): Promise<void> {
    const { projectPath, featureId } = data;

    // Initialize agent if needed
    await this.initializeForProject(projectPath);

    // Check if already processing
    const key = `${projectPath}:${featureId}`;
    if (this.processing.has(key)) {
      logger.debug(`Already processing ${key}`);
      return;
    }
    this.processing.add(key);

    try {
      // Load feature
      const feature = await this.featureLoader.loadFeature(projectPath, featureId);
      if (!feature) {
        logger.error(`Feature not found: ${featureId}`);
        return;
      }

      // Perform agent logic
      await this.performWork(projectPath, feature);
    } catch (error) {
      logger.error(`Error processing ${key}:`, error);
    } finally {
      this.processing.delete(key);
    }
  }

  /**
   * Core agent logic
   */
  private async performWork(
    projectPath: string,
    feature: Feature
  ): Promise<void> {
    logger.info(`{Name} processing feature: ${feature.id}`);

    // 1. Load context
    const contextResult = await loadContextFiles({
      projectPath,
      taskContext: {
        title: feature.title,
        description: feature.description,
      },
    });

    // 2. Build prompt
    const systemPrompt = `You are the {Role} for this project.

Your responsibilities:
- {Responsibility 1}
- {Responsibility 2}

Current task: ${feature.title}
Description: ${feature.description}

${contextResult.formattedPrompt}`;

    const userPrompt = `Review this feature and provide your assessment.`;

    // 3. Query AI
    const result = await simpleQuery({
      systemPrompt,
      userPrompt,
      model: {NAME}_MODEL,
      projectPath,
    });

    // 4. Submit proposal through authority system
    await this.authorityService.submitProposal({
      projectPath,
      featureId: feature.id,
      agentId: this.agents.get(projectPath)!.agentId,
      action: 'transition',
      proposedData: {
        status: 'new-status',
        // ... other fields
      },
      reasoning: result,
    });

    logger.info(`{Name} completed work for feature: ${feature.id}`);
  }
}
```

### 2. Wire Into AuthorityService

Edit `apps/server/src/services/authority-service.ts`:

```typescript
// Import the new agent
import { {Name}AuthorityAgent } from './authority-agents/{name}-agent.js';

// In the constructor, initialize the agent
this.{name}Agent = new {Name}AuthorityAgent(
  this.events,
  this,
  this.featureLoader
);
```

### 3. Add Role Documentation

Create `docs/authority/roles/{name}.md`:

```markdown
# {Name} Agent

**Role:** {Full Role Title}
**Responsibilities:** {List of responsibilities}
**Triggers:** {Event triggers}
**Trust Level:** {auto-approve | requires-approval}

## Workflow

[Diagram or description of the agent's workflow]

## Decision Authority

[What decisions can this agent make autonomously?]
[What requires approval?]

## Communication

[How does this agent communicate with other agents?]
[Discord channels, event types, etc.]
```

### 4. Update Types (if needed)

If the agent introduces new feature states or fields, update `libs/types/src/feature.ts`:

```typescript
export type FeatureStatus = 'backlog' | 'in_progress' | 'review' | 'done' | 'your-new-status'; // Add new status if needed

export interface Feature {
  // ... existing fields
  yourNewField?: string; // Add new field if needed
}
```

## Example: Adding a Designer Agent

Let's walk through adding a **Designer Agent** that reviews UI changes before merging:

**Role:** Review PRs for UI consistency, accessibility, and design system compliance
**Trigger:** PR created for features with `ui` tag
**Trust Level:** `auto-approve` (posts review comments, doesn't block merge)

### 1. Create the Agent

`apps/server/src/services/authority-agents/designer-agent.ts`:

```typescript
/**
 * Designer Authority Agent - UI/UX Design Lead
 *
 * Reviews PRs for UI changes to ensure:
 * - Design system compliance (colors, typography, spacing)
 * - Accessibility (WCAG AA standards)
 * - Responsive design (mobile, tablet, desktop)
 * - Visual consistency with existing UI
 *
 * Pipeline:
 *   1. PR created → checks for UI file changes
 *   2. If UI changes detected → review PR diff
 *   3. Post review comments (non-blocking)
 *   4. Notify Discord #design channel
 */

import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import { simpleQuery } from '../../providers/simple-query-service.js';

const logger = createLogger('DesignerAgent');
const DESIGNER_MODEL = resolveModelString('sonnet');

const UI_FILE_PATTERNS = [/\.tsx$/, /\.css$/, /\/components\//, /\/views\//, /tailwind\.config/];

export class DesignerAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private listenerRegistered = false;

  constructor(events: EventEmitter, authorityService: AuthorityService) {
    this.events = events;
    this.authorityService = authorityService;
    this.registerEventListener();
  }

  private registerEventListener(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;

    this.events.on('pr:created', async (data) => {
      await this.reviewPR(data);
    });
  }

  private async reviewPR(data: {
    projectPath: string;
    featureId: string;
    prNumber: number;
    files: string[];
  }): Promise<void> {
    const { projectPath, prNumber, files } = data;

    // Check if PR contains UI changes
    const hasUIChanges = files.some((file) =>
      UI_FILE_PATTERNS.some((pattern) => pattern.test(file))
    );

    if (!hasUIChanges) {
      logger.debug(`PR #${prNumber} has no UI changes, skipping review`);
      return;
    }

    logger.info(`Designer reviewing PR #${prNumber} for UI changes`);

    // Get PR diff (simplified - use gh CLI in real implementation)
    const systemPrompt = `You are the UI/UX Design Lead.

Review this PR for:
- Design system compliance (check colors, spacing, typography)
- Accessibility (WCAG AA: alt text, keyboard nav, color contrast)
- Responsive design (works on mobile, tablet, desktop)
- Visual consistency with existing UI

Provide constructive feedback as GitHub review comments.`;

    const userPrompt = `Review PR #${prNumber}. Files changed: ${files.join(', ')}`;

    const review = await simpleQuery({
      systemPrompt,
      userPrompt,
      model: DESIGNER_MODEL,
      projectPath,
    });

    // Post review to GitHub (use gh CLI)
    // gh pr review ${prNumber} --comment --body "${review}"

    // Notify Discord
    this.events.emit('discord:send', {
      channel: 'design',
      message: `🎨 Designer reviewed PR #${prNumber}:\n\n${review}`,
    });

    logger.info(`Designer completed review for PR #${prNumber}`);
  }
}
```

### 2. Wire It In

`apps/server/src/services/authority-service.ts`:

```typescript
import { DesignerAuthorityAgent } from './authority-agents/designer-agent.js';

// In constructor:
this.designerAgent = new DesignerAuthorityAgent(this.events, this);
```

### 3. Document the Role

`docs/authority/roles/designer.md`:

```markdown
# Designer Agent

**Role:** UI/UX Design Lead
**Responsibilities:** Review UI changes for design system compliance and accessibility
**Triggers:** PR created with UI file changes
**Trust Level:** auto-approve (non-blocking reviews)

## Workflow

1. PR created → event emitted
2. Designer checks for UI file changes
3. If UI changes detected → review PR diff
4. Post review comments to GitHub
5. Notify #design Discord channel

## Decision Authority

**Autonomous:**

- Post design review comments
- Suggest improvements

**Requires Approval:**

- N/A (reviews are advisory, not blocking)
```

## Testing Your Teammate

### Unit Tests

Create `apps/server/tests/unit/authority-agents/{name}-agent.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { {Name}AuthorityAgent } from '../../../src/services/authority-agents/{name}-agent.js';
import { createTestEventEmitter } from '../../helpers/test-events.js';
import { createMockAuthorityService } from '../../mocks/authority-service.js';

describe('{Name}AuthorityAgent', () => {
  let agent: {Name}AuthorityAgent;
  let events: any;
  let authorityService: any;

  beforeEach(() => {
    events = createTestEventEmitter();
    authorityService = createMockAuthorityService();
    agent = new {Name}AuthorityAgent(events, authorityService);
  });

  it('should register event listeners', () => {
    expect(events.listenerCount('your-event')).toBeGreaterThan(0);
  });

  it('should process events correctly', async () => {
    await events.emit('your-event', { /* test data */ });
    // Assert expected behavior
  });
});
```

### Integration Tests

1. **Trigger the event manually** via Discord or API
2. **Watch logs** for agent activation
3. **Verify state transitions** on features
4. **Check Discord messages** for notifications

---

**Next:** Read [Creating Agent Teams](./creating-agent-teams.md) to build multi-agent coordination systems.
