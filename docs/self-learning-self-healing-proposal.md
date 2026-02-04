# Self-Learning & Self-Healing Architecture Proposal

This document outlines enhancements to Automaker's autonomous development capabilities, drawing insights from OpenClaw's self-extending skills and the Ralph Wiggum persistent loop pattern.

---

## Executive Summary

Automaker already has strong foundations for autonomous development:
- Memory system with smart selection and usage tracking
- Learning extraction from agent output
- Event hooks for external integrations
- Auto-mode for autonomous feature processing
- Git worktree isolation

This proposal adds four key capabilities:
1. **Self-Learning Skills** - Agents can create new reusable skills
2. **Self-Healing Recovery** - Automatic detection and repair of failures
3. **Persistent Retry Loops** - Ralph-style "never give up" execution
4. **Proactive Automation** - Scheduled tasks and health monitoring

---

## Part 1: Gap Analysis

### What OpenClaw Has That Automaker Lacks

| Capability | OpenClaw | Automaker | Gap |
|------------|----------|-----------|-----|
| Self-extending skills | Agents write SKILL.md files | Fixed tool set | **Critical** |
| 24/7 operation | Daemon mode with cron jobs | On-demand only | Medium |
| Proactive outreach | Agent messages user first | Reactive only | Medium |
| Filesystem as memory | Everything persists | Memory files only | Small |
| Stop hook verification | External completion check | Agent self-reports | **Critical** |

### What Ralph Wiggum Has That Automaker Lacks

| Capability | Ralph | Automaker | Gap |
|------------|-------|-----------|-----|
| Persistent retry loops | Never stops until verified | 3 failure pause | **Critical** |
| Completion verification | Tests must pass | Agent declares done | **Critical** |
| Progress file tracking | progress.txt per iteration | Memory only | Small |
| Stop hook mechanism | External exit interception | Internal abort | Medium |
| Git history as context | Full diff analysis | Limited | Small |

---

## Part 2: Self-Learning Skills System

### 2.1 Concept: Agent-Writable Skills

**Inspired by OpenClaw's SKILL.md pattern**

When an agent encounters a task it cannot complete with existing tools, it should be able to:
1. Create a new skill definition
2. Store it persistently
3. Make it available to all future agents

### 2.2 Skill Definition Format

Create a new skills system at `.automaker/skills/`:

```yaml
# .automaker/skills/database-migration.md
---
name: database-migration
emoji: 🗄️
description: Generate and run database migrations
requires:
  bins: [node, npx]
  files: [package.json, prisma/schema.prisma]
author: agent
created: 2026-02-04
usageCount: 0
successRate: 0
---

# Database Migration Skill

## When to Use
Use this skill when the user asks to:
- Add a new database table or column
- Modify existing schema
- Generate migration files

## Steps
1. Analyze the requested schema change
2. Update `prisma/schema.prisma`
3. Run `npx prisma migrate dev --name {migration_name}`
4. Verify migration applied successfully

## Tools Required
- File editing for schema changes
- Bash for running prisma commands

## Success Criteria
- Migration file created in `prisma/migrations/`
- `npx prisma migrate status` shows no pending migrations
```

### 2.3 Implementation: Skills Loader

**File: `libs/utils/src/skills-loader.ts`**

```typescript
interface Skill {
  name: string;
  emoji: string;
  description: string;
  requires: {
    bins?: string[];
    files?: string[];
    env?: string[];
  };
  content: string;
  metadata: {
    author: 'user' | 'agent';
    created: string;
    usageCount: number;
    successRate: number;
  };
}

async function loadRelevantSkills(
  projectPath: string,
  featureTitle: string,
  featureDescription: string
): Promise<Skill[]>

async function createSkill(
  projectPath: string,
  skill: Omit<Skill, 'metadata'>
): Promise<void>

async function recordSkillUsage(
  projectPath: string,
  skillName: string,
  success: boolean
): Promise<void>
```

### 2.4 Agent Prompt Addition

Add to auto-mode prompts:

```markdown
## Self-Extension Capability

If you encounter a task that would benefit from a reusable skill:
1. Create a skill file at `.automaker/skills/{skill-name}.md`
2. Follow the SKILL.md format with YAML frontmatter
3. Include clear steps, requirements, and success criteria
4. The skill will be available to all future agents

Only create skills for patterns that will be reused (not one-off tasks).
```

---

## Part 3: Self-Healing Mechanisms

### 3.1 Failure Classification Enhancement

**Current:** Basic error classification with quota/rate limit detection
**Enhancement:** Rich failure taxonomy with recovery strategies

```typescript
// libs/types/src/failure.ts

type FailureCategory =
  | 'transient'      // Network, timeout - retry immediately
  | 'rate_limit'     // API throttle - exponential backoff
  | 'quota'          // Usage limit - pause and notify
  | 'validation'     // Bad input - needs human review
  | 'tool_error'     // Tool failed - try alternative approach
  | 'test_failure'   // Tests failed - retry with fixes
  | 'merge_conflict' // Git conflict - needs resolution
  | 'dependency'     // Missing dep - attempt auto-install
  | 'unknown';       // Unclassified - escalate

interface FailureAnalysis {
  category: FailureCategory;
  isRetryable: boolean;
  suggestedDelay: number;
  maxRetries: number;
  recoveryStrategy: RecoveryStrategy;
  contextToPreserve: string[];
}

type RecoveryStrategy =
  | { type: 'retry'; delay: number }
  | { type: 'retry_with_context'; context: string }
  | { type: 'alternative_approach'; suggestion: string }
  | { type: 'rollback_and_retry' }
  | { type: 'escalate_to_user' }
  | { type: 'pause_and_wait'; duration: number };
```

### 3.2 Self-Healing Hook System

**New Event Triggers:**

```typescript
// libs/types/src/settings.ts - add to EventHookTrigger

type EventHookTrigger =
  | 'feature_created'
  | 'feature_success'
  | 'feature_error'
  | 'feature_retry'           // NEW: Feature being retried
  | 'feature_recovery'        // NEW: Recovery action taken
  | 'auto_mode_complete'
  | 'auto_mode_error'
  | 'auto_mode_health_check'  // NEW: Periodic health status
  | 'skill_created'           // NEW: Agent created new skill
  | 'memory_learning'         // NEW: New learning recorded
```

### 3.3 Recovery Action Service

**File: `apps/server/src/services/recovery-service.ts`**

```typescript
class RecoveryService {
  /**
   * Analyze a failure and determine recovery strategy
   */
  async analyzeFailure(
    featureId: string,
    error: Error,
    context: ExecutionContext
  ): Promise<FailureAnalysis>

  /**
   * Execute automatic recovery based on strategy
   */
  async executeRecovery(
    featureId: string,
    analysis: FailureAnalysis
  ): Promise<RecoveryResult>

  /**
   * Record recovery attempt for learning
   */
  async recordRecoveryAttempt(
    featureId: string,
    strategy: RecoveryStrategy,
    success: boolean
  ): Promise<void>
}
```

### 3.4 Integration Points

Modify `auto-mode-service.ts`:

```typescript
// In executeFeatureWithAgent(), after catching error:

const analysis = await this.recoveryService.analyzeFailure(
  feature.id,
  error,
  executionContext
);

if (analysis.isRetryable && retryCount < analysis.maxRetries) {
  // Record retry attempt
  await this.recordFeatureRetry(feature, analysis);

  // Execute recovery strategy
  const recoveryResult = await this.recoveryService.executeRecovery(
    feature.id,
    analysis
  );

  if (recoveryResult.shouldRetry) {
    await this.sleep(analysis.suggestedDelay);
    return this.executeFeatureWithAgent(feature, retryCount + 1);
  }
}
```

---

## Part 4: Persistent Retry Loops (Ralph Pattern)

### 4.1 Core Concept

**Ralph Philosophy:** "Never give up until verifiable completion"

Key differences from current auto-mode:
1. **External Verification** - Tests/validation must pass, not agent declaration
2. **Iteration Logging** - Each attempt logged with learnings
3. **Context Accumulation** - Failures feed into next attempt
4. **Configurable Persistence** - Max iterations, completion criteria

### 4.2 Ralph Mode Configuration

```typescript
// libs/types/src/feature.ts - add to Feature

interface RalphModeConfig {
  enabled: boolean;
  maxIterations: number;
  completionCriteria: CompletionCriterion[];
  iterationDelay: number; // ms between iterations
  preserveContext: boolean; // Feed failures to next attempt
  progressFile: string; // Path to iteration log
}

type CompletionCriterion =
  | { type: 'tests_pass'; command: string }
  | { type: 'build_succeeds'; command: string }
  | { type: 'lint_clean'; command: string }
  | { type: 'file_exists'; path: string }
  | { type: 'file_contains'; path: string; pattern: string }
  | { type: 'custom_script'; command: string; successExitCode: number };
```

### 4.3 Completion Verification Service

**File: `apps/server/src/services/completion-verifier.ts`**

```typescript
class CompletionVerifierService {
  /**
   * Verify all completion criteria are met
   */
  async verifyCompletion(
    projectPath: string,
    criteria: CompletionCriterion[],
    worktreePath?: string
  ): Promise<VerificationResult>

  /**
   * Run specific criterion check
   */
  async checkCriterion(
    projectPath: string,
    criterion: CompletionCriterion
  ): Promise<CriterionResult>
}

interface VerificationResult {
  allPassed: boolean;
  results: CriterionResult[];
  summary: string;
}

interface CriterionResult {
  criterion: CompletionCriterion;
  passed: boolean;
  output: string;
  duration: number;
}
```

### 4.4 Ralph Loop Implementation

**File: `apps/server/src/services/ralph-loop-service.ts`**

```typescript
class RalphLoopService {
  private events: EventEmitter;
  private verifier: CompletionVerifierService;
  private recoveryService: RecoveryService;

  /**
   * Execute feature in Ralph mode - persistent retry until verified
   */
  async executeRalphLoop(
    feature: Feature,
    config: RalphModeConfig,
    projectPath: string
  ): Promise<RalphLoopResult> {
    let iteration = 0;
    const progressLog: IterationLog[] = [];

    while (iteration < config.maxIterations) {
      iteration++;
      const iterationStart = Date.now();

      // Build context from previous failures
      const context = config.preserveContext
        ? this.buildIterationContext(progressLog)
        : undefined;

      try {
        // Execute the agent
        await this.executeAgentIteration(feature, context);

        // Verify completion criteria
        const verification = await this.verifier.verifyCompletion(
          projectPath,
          config.completionCriteria
        );

        // Log iteration
        progressLog.push({
          iteration,
          duration: Date.now() - iterationStart,
          verification,
          error: null,
        });

        // Save progress file
        await this.saveProgressFile(config.progressFile, progressLog);

        if (verification.allPassed) {
          return {
            success: true,
            iterations: iteration,
            progressLog,
          };
        }

        // Emit progress event
        this.emitProgress(feature.id, iteration, verification);

      } catch (error) {
        progressLog.push({
          iteration,
          duration: Date.now() - iterationStart,
          verification: null,
          error: error.message,
        });

        await this.saveProgressFile(config.progressFile, progressLog);
      }

      // Delay before next iteration
      await this.sleep(config.iterationDelay);
    }

    return {
      success: false,
      iterations: iteration,
      progressLog,
      reason: 'max_iterations_reached',
    };
  }

  private buildIterationContext(logs: IterationLog[]): string {
    // Build context from failures for next iteration
    const failures = logs.filter(l => !l.verification?.allPassed);
    return failures.map(f =>
      `Iteration ${f.iteration} failed: ${f.error || f.verification?.summary}`
    ).join('\n');
  }
}
```

### 4.5 Progress File Format

```markdown
# Ralph Loop Progress: feature-123

## Iteration 1 (2026-02-04T10:30:00Z)
- Duration: 45s
- Status: FAILED
- Tests: 3/5 passing
- Errors:
  - TypeError: Cannot read property 'user' of undefined
  - Test "should validate email" failed

## Iteration 2 (2026-02-04T10:31:00Z)
- Duration: 52s
- Status: FAILED
- Tests: 4/5 passing
- Errors:
  - Test "should handle edge case" failed

## Iteration 3 (2026-02-04T10:32:00Z)
- Duration: 38s
- Status: SUCCESS
- Tests: 5/5 passing
- Verification: All criteria met

## Summary
- Total iterations: 3
- Total duration: 2m 15s
- Final status: SUCCESS
```

---

## Part 5: Proactive Automation

### 5.1 Health Monitor Service

**File: `apps/server/src/services/health-monitor-service.ts`**

```typescript
class HealthMonitorService {
  private checkInterval: NodeJS.Timer | null = null;

  /**
   * Start periodic health monitoring
   */
  startMonitoring(intervalMs: number = 300000) {
    this.checkInterval = setInterval(
      () => this.runHealthCheck(),
      intervalMs
    );
  }

  private async runHealthCheck(): Promise<HealthReport> {
    const report: HealthReport = {
      timestamp: new Date().toISOString(),
      checks: [],
    };

    // Check stuck features (running > 30 min)
    report.checks.push(await this.checkStuckFeatures());

    // Check failed features eligible for retry
    report.checks.push(await this.checkRetryableFeatures());

    // Check worktree health
    report.checks.push(await this.checkWorktreeHealth());

    // Check memory/disk usage
    report.checks.push(await this.checkResourceUsage());

    // Emit health report
    this.emitHealthReport(report);

    // Auto-remediate if configured
    await this.autoRemediate(report);

    return report;
  }

  private async autoRemediate(report: HealthReport): Promise<void> {
    for (const check of report.checks) {
      if (check.status === 'critical' && check.autoRemediable) {
        await this.executeRemediation(check);
      }
    }
  }
}
```

### 5.2 Scheduled Task System

**New type in `libs/types/src/settings.ts`:**

```typescript
interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string; // Cron expression
  action: ScheduledAction;
  lastRun?: string;
  nextRun?: string;
}

type ScheduledAction =
  | { type: 'health_check' }
  | { type: 'retry_failed_features' }
  | { type: 'cleanup_old_worktrees'; maxAgeDays: number }
  | { type: 'backup_memories' }
  | { type: 'custom_shell'; command: string };
```

---

## Part 6: MCP Tool Additions

### 6.1 New MCP Tools

Add to `packages/mcp-server/src/index.ts`:

```typescript
// Self-Learning
'create_skill' - Create a new reusable skill
'list_skills' - List available skills
'get_skill' - Get skill details
'delete_skill' - Remove a skill

// Self-Healing
'retry_feature' - Manually trigger retry with context
'get_failure_analysis' - Analyze why a feature failed
'execute_recovery' - Run specific recovery action

// Ralph Mode
'start_ralph_loop' - Start persistent retry loop
'stop_ralph_loop' - Stop running loop
'get_ralph_progress' - Get iteration progress
'set_completion_criteria' - Define success criteria

// Health & Scheduling
'get_health_report' - Get current health status
'schedule_task' - Create scheduled task
'list_scheduled_tasks' - List all scheduled tasks
'run_scheduled_task' - Manually trigger task
```

### 6.2 MCP Tool Schemas

```typescript
// create_skill
{
  projectPath: string;
  name: string;
  description: string;
  content: string;
  requires?: {
    bins?: string[];
    files?: string[];
    env?: string[];
  };
}

// start_ralph_loop
{
  projectPath: string;
  featureId: string;
  maxIterations: number;
  completionCriteria: CompletionCriterion[];
  iterationDelay?: number;
  preserveContext?: boolean;
}

// get_failure_analysis
{
  projectPath: string;
  featureId: string;
}
// Returns: FailureAnalysis with recovery suggestions
```

---

## Part 7: Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

1. **Failure Classification Enhancement**
   - Modify: `libs/utils/src/errors.ts`
   - Add: `libs/types/src/failure.ts`
   - Update: `apps/server/src/services/auto-mode-service.ts`

2. **Completion Verification Service**
   - Add: `apps/server/src/services/completion-verifier.ts`
   - Integrate with feature execution flow

3. **Recovery Service**
   - Add: `apps/server/src/services/recovery-service.ts`
   - Add recovery strategies

### Phase 2: Ralph Loops (Week 3-4)

4. **Ralph Loop Service**
   - Add: `apps/server/src/services/ralph-loop-service.ts`
   - Add progress file tracking
   - Add iteration context building

5. **Feature Configuration**
   - Update: `libs/types/src/feature.ts` with RalphModeConfig
   - Update UI for Ralph mode settings

6. **MCP Tools**
   - Add Ralph-related tools to MCP server

### Phase 3: Self-Learning (Week 5-6)

7. **Skills System**
   - Add: `libs/utils/src/skills-loader.ts`
   - Add skills directory structure
   - Add skill creation from agents

8. **Agent Prompt Updates**
   - Update prompts to include skill creation capability
   - Add skill loading to context

9. **MCP Skill Tools**
   - Add skill management tools

### Phase 4: Proactive Automation (Week 7-8)

10. **Health Monitor**
    - Add: `apps/server/src/services/health-monitor-service.ts`
    - Add auto-remediation logic

11. **Scheduled Tasks**
    - Add: `apps/server/src/services/scheduler-service.ts`
    - Add cron-based execution

12. **New Event Hooks**
    - Add health_check, skill_created, memory_learning triggers
    - Update event-hook-service.ts

---

## Part 8: Configuration Examples

### 8.1 Ralph Mode Feature

```json
{
  "id": "feature-123",
  "title": "Add user authentication",
  "ralphMode": {
    "enabled": true,
    "maxIterations": 10,
    "iterationDelay": 5000,
    "preserveContext": true,
    "progressFile": ".automaker/ralph/feature-123-progress.md",
    "completionCriteria": [
      { "type": "tests_pass", "command": "npm test -- --grep auth" },
      { "type": "build_succeeds", "command": "npm run build" },
      { "type": "lint_clean", "command": "npm run lint" }
    ]
  }
}
```

### 8.2 Self-Healing Hook

```json
{
  "eventHooks": [
    {
      "id": "retry-test-failures",
      "name": "Auto-retry test failures",
      "trigger": "feature_error",
      "enabled": true,
      "conditions": {
        "errorType": "test_failure",
        "maxRetries": 3
      },
      "action": {
        "type": "recovery",
        "strategy": "retry_with_context"
      }
    }
  ]
}
```

### 8.3 Scheduled Health Check

```json
{
  "scheduledTasks": [
    {
      "id": "hourly-health",
      "name": "Hourly Health Check",
      "enabled": true,
      "schedule": "0 * * * *",
      "action": {
        "type": "health_check"
      }
    },
    {
      "id": "retry-failed",
      "name": "Retry Failed Features",
      "enabled": true,
      "schedule": "*/30 * * * *",
      "action": {
        "type": "retry_failed_features"
      }
    }
  ]
}
```

---

## Part 9: Success Metrics

### 9.1 Self-Learning Metrics
- Skills created per project
- Skill reuse rate
- Skill success rate over time

### 9.2 Self-Healing Metrics
- Auto-recovery success rate
- Mean time to recovery (MTTR)
- Reduction in manual interventions

### 9.3 Ralph Loop Metrics
- Average iterations to completion
- Completion rate vs max iterations reached
- Time saved vs manual intervention

### 9.4 Overall Autonomy Score
```
Autonomy Score = (
  (Features completed without intervention / Total features) * 0.4 +
  (Successful auto-recoveries / Total failures) * 0.3 +
  (Skills created and reused / Total unique tasks) * 0.2 +
  (Health issues auto-remediated / Total health issues) * 0.1
)
```

---

## Appendix: File Change Summary

### New Files
- `libs/types/src/failure.ts`
- `libs/types/src/skill.ts`
- `libs/utils/src/skills-loader.ts`
- `apps/server/src/services/completion-verifier.ts`
- `apps/server/src/services/recovery-service.ts`
- `apps/server/src/services/ralph-loop-service.ts`
- `apps/server/src/services/health-monitor-service.ts`
- `apps/server/src/services/scheduler-service.ts`

### Modified Files
- `libs/types/src/feature.ts` - Add RalphModeConfig
- `libs/types/src/settings.ts` - Add new event triggers, scheduled tasks
- `libs/utils/src/errors.ts` - Enhanced failure classification
- `apps/server/src/services/auto-mode-service.ts` - Recovery integration
- `apps/server/src/services/event-hook-service.ts` - New triggers
- `packages/mcp-server/src/index.ts` - New MCP tools

### New Directories
- `.automaker/skills/` - Project skills
- `.automaker/ralph/` - Ralph loop progress files
- `~/.automaker/skills/` - Global user skills
